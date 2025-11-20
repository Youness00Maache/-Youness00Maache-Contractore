
import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData } from '../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

// A valid 1x1 transparent PNG base64 to use as fallback
const PAYPAL_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC+klEQVR4nO2Wy2sTQRzHf7M72d2k2XbT9mHTx6N4EBE8eBARwaM3D149efHgxQ/wL3jx4MGDt4J4FfEgiJdSoXgQpCItbZq0SZu0iW6yO5md8f12N2mbbG2j+MDAO8zsfmfmN7/f7Ar85yO+7QCt1WqZcDj8QRAE+W0H6L1e75nL5XqVSqU0tx2g+/3+i8FgcD0cDi/eVoA2m803o9HoVjQaXbmtAN3pdF4Ph8M7sVhs9bYC9EAguBuLxdbfVoB2Op23QqHQbjweX7utAO10Om+Fw+HdeDy+dlsBejAY3I3FYuu3FaD7/f6LwWBwPRwOL95WgNbr9Z65XK5XqVRKc9sB+v8K8P92wL9QAAmC8DIIwnsA3wG8FwThg67rX4x6A4IgrAO4AeAygH0ADgH0AHgH0AHgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13XvxgF0AO4C+ACgH0AHgL4JgjCN13X/b+QWIv2Qc+35y4AAAAABJRU5ErkJggg==';

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

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

// Determine if white or black text is better for a given background color
const getContrastColor = (hex: string) => {
    const rgb = hexToRgb(hex);
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

// Helper to get style and override with custom colors
const getTemplate = (id: string | undefined, customColors?: { primary: string, secondary: string }): TemplateStyle => {
    const baseTemplate = templates[id || 'standard'] || templates.standard;
    if (customColors) {
        const primary = customColors.primary || baseTemplate.primaryColor;
        const secondary = customColors.secondary || baseTemplate.secondaryColor;
        
        // If the template typically has a white header, keep it white, otherwise use the new primary color
        const newHeaderColor = baseTemplate.headerColor === '#ffffff' ? '#ffffff' : primary;
        
        // Calculate contrast for the header text
        const newHeaderTextColor = newHeaderColor === '#ffffff' ? primary : getContrastColor(primary);

        return {
            ...baseTemplate,
            primaryColor: primary,
            secondaryColor: secondary,
            headerColor: newHeaderColor,
            headerTextColor: newHeaderTextColor,
            borderColor: secondary
        };
    }
    return baseTemplate;
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

// Smart Text Positioning Helper
const drawSmartLabelValue = (doc: any, label: string, value: string, y: number, maxX: number, font: string) => {
    doc.setFont(font, 'normal'); 
    
    // 1. Calculate width of the value
    const valueWidth = doc.getTextWidth(value);
    
    // 2. Draw Value right-aligned at maxX
    doc.text(value, maxX, y, { align: 'right' });
    
    // 3. Draw Label right-aligned to the left of the value with padding
    // Padding ensures "enough space" without being huge
    const padding = 12; 
    const labelX = maxX - valueWidth - padding;
    
    doc.setFont(font, 'bold');
    doc.text(label, labelX, y, { align: 'right' });
};

// Universal Header Function
const addHeader = async (doc: any, profile: UserProfile, title: string, dateLabel: string, dateValue: string, style: TemplateStyle) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    
    // Header Bar Height
    const headerHeight = 100;

    // 1. Draw Background Rectangle
    if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
    }

    // 2. Logo (Left, vertically centered in header)
    const logoMaxHeight = 60;
    if (profile.logoUrl) {
        try {
            const imgData = await loadImage(profile.logoUrl);
            if (imgData) {
                const aspectRatio = imgData.width / imgData.height;
                let imgWidth = logoMaxHeight * aspectRatio;
                let imgHeight = logoMaxHeight;
                
                // Constrain width if wider than 120
                if (imgWidth > 120) {
                    imgWidth = 120;
                    imgHeight = imgWidth / aspectRatio;
                }

                const logoY = (headerHeight - imgHeight) / 2;
                doc.addImage(imgData.data, imgData.format, margin, logoY, imgWidth, imgHeight);
            }
        } catch (e) {
            console.warn("Failed to add logo to header:", e);
        }
    }

    // 3. Title & Date (Right aligned, centered in header)
    doc.setFontSize(24);
    doc.setFont(style.headerFont, 'bold');
    doc.setTextColor(...hexToRgb(style.headerTextColor));
    
    // Title
    const titleY = headerHeight / 2 + 5; // Approx vertical center
    doc.text(title, pageWidth - margin, titleY - 10, { align: 'right' });
    
    // Date
    doc.setFontSize(10);
    doc.setFont(style.font, 'normal');
    // Use smart spacing for consistency even here
    // doc.text(`${dateLabel}: ${dateValue}`, pageWidth - margin, titleY + 10, { align: 'right' });
    drawSmartLabelValue(doc, `${dateLabel}:`, dateValue, titleY + 10, pageWidth - margin, style.font);

    // Return Safe Y start for body content
    return headerHeight + 40; 
};

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoiceData: InvoiceData, templateId: string) => {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF('p', 'pt', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;

      const style = getTemplate(templateId, invoiceData.themeColors);

      // --- 1. Header Bar (Clean Zone) ---
      const headerHeight = 110;
      if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
      }

      // Logo (Left Side of Header)
      const logoSource = invoiceData.logoUrl || profile.logoUrl;
      if (logoSource) {
          try {
            const imgData = await loadImage(logoSource);
            if (imgData) {
                const aspectRatio = imgData.width / imgData.height;
                // Max size 150x80 inside header
                let imgWidth = 80 * aspectRatio;
                let imgHeight = 80;
                if (imgWidth > 150) { imgWidth = 150; imgHeight = imgWidth / aspectRatio; }
                
                const logoY = (headerHeight - imgHeight) / 2;
                doc.addImage(imgData.data, imgData.format, margin, logoY, imgWidth, imgHeight);
            }
          } catch (e) { console.warn("Logo error", e); }
      }

      // Title & Meta (Right Side of Header)
      doc.setFontSize(24);
      doc.setFont(style.headerFont, 'bold');
      doc.setTextColor(...hexToRgb(style.headerTextColor));
      doc.text('INVOICE', pageWidth - margin, 45, { align: 'right' });
      
      doc.setFontSize(10);
      
      // Smart Spacing for Meta Data
      let metaY = 65;
      const lineHeight = 18; 
      const rightColX = pageWidth - margin;

      drawSmartLabelValue(doc, 'Invoice #:', invoiceData.invoiceNumber.toString(), metaY, rightColX, style.font);
      metaY += lineHeight;
      drawSmartLabelValue(doc, 'Date:', invoiceData.issueDate, metaY, rightColX, style.font);
      metaY += lineHeight;
      drawSmartLabelValue(doc, 'Due Date:', invoiceData.dueDate, metaY, rightColX, style.font);

      // --- 2. Address Grid (Below Header) ---
      // Clean separation: Company on Left, Client on Right
      let contentY = headerHeight + 30;
      doc.setTextColor(...hexToRgb(style.textColor)); // Reset text color to black/dark
      
      // Company Info (Left)
      doc.setFontSize(10);
      doc.setFont(style.font, 'bold');
      doc.text('FROM', margin, contentY);
      contentY += 15;
      
      doc.setFontSize(11);
      doc.text(invoiceData.companyName || profile.companyName, margin, contentY);
      contentY += 15;
      
      doc.setFont(style.font, 'normal');
      doc.setFontSize(10);
      const companyAddress = invoiceData.companyAddress || profile.address;
      const companyLines = doc.splitTextToSize(companyAddress, pageWidth/2 - margin - 20);
      doc.text(companyLines, margin, contentY);
      
      let leftColumnY = contentY + (companyLines.length * 12) + 5;
      if (invoiceData.companyPhone || profile.phone) {
          doc.text(invoiceData.companyPhone || profile.phone, margin, leftColumnY);
          leftColumnY += 12;
      }
      if (invoiceData.companyWebsite || profile.website) {
          doc.text(invoiceData.companyWebsite || profile.website, margin, leftColumnY);
          leftColumnY += 12;
      }

      // Client Info (Right) - Reset Y to top of section
      let rightColumnY = headerHeight + 30; 
      doc.setFont(style.font, 'bold');
      doc.setFontSize(10);
      doc.text('BILL TO', pageWidth/2 + 20, rightColumnY);
      rightColumnY += 15;

      doc.setFontSize(11);
      doc.text(invoiceData.clientName || job.clientName, pageWidth/2 + 20, rightColumnY);
      rightColumnY += 15;

      doc.setFont(style.font, 'normal');
      doc.setFontSize(10);
      const clientAddress = invoiceData.clientAddress || job.clientAddress;
      const clientLines = doc.splitTextToSize(clientAddress, pageWidth/2 - margin);
      doc.text(clientLines, pageWidth/2 + 20, rightColumnY);
      rightColumnY += (clientLines.length * 12);

      // Use the maximum Y from either column to start the table
      let tableStartY = Math.max(leftColumnY, rightColumnY) + 30;

      // --- 3. Items Table ---
      const tableData = invoiceData.lineItems.map(item => [
        item.description,
        item.quantity,
        `$${Number(item.rate).toFixed(2)}`,
        `$${(Number(item.quantity) * Number(item.rate)).toFixed(2)}`
      ]);

      (doc as any).autoTable({
        startY: tableStartY,
        head: [['Description', 'Quantity', 'Rate', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: hexToRgb(style.primaryColor), 
            textColor: hexToRgb(getContrastColor(style.primaryColor)),
            font: style.font,
            fontStyle: 'bold'
        },
        bodyStyles: { 
            textColor: hexToRgb(style.textColor), 
            font: style.font,
            valign: 'top' 
        },
        alternateRowStyles: { fillColor: hexToRgb(style.alternateRowColor) },
        styles: { 
            fontSize: 10, 
            cellPadding: 8, 
            lineColor: hexToRgb(style.borderColor), 
            lineWidth: 0.1,
            overflow: 'linebreak'
        },
        columnStyles: {
            0: { cellWidth: 'auto' }, // Description takes remaining space
            1: { cellWidth: 65, halign: 'center' }, // Increased to 65 to fit "Quantity"
            2: { cellWidth: 70, halign: 'right' },
            3: { cellWidth: 70, halign: 'right' }
        },
        margin: { left: margin, right: margin }
      });

      // --- 4. Totals ---
      let finalY = (doc as any).autoTable.previous.finalY + 20;
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      
      // Calculate totals
      const subtotal = invoiceData.lineItems.reduce((acc, item) => acc + Number(item.quantity) * Number(item.rate), 0);
      const discount = Number(invoiceData.discount || 0);
      const shipping = Number(invoiceData.shipping || 0);
      const taxAmount = (subtotal - discount) * ((Number(invoiceData.taxRate) || 0) / 100);
      const total = (subtotal - discount) + taxAmount + shipping;

      const addTotalLine = (label: string, value: string, isBold = false) => {
        const startX = pageWidth - margin;
        doc.setFont(style.font, isBold ? 'bold' : 'normal');
        // Smart alignment for totals too
        drawSmartLabelValue(doc, label, value, finalY, startX, style.font);
        finalY += 18;
      };

      doc.setFontSize(10);
      addTotalLine('Subtotal:', currencyFormatter.format(subtotal));
      if (discount > 0) addTotalLine('Discount:', `-${currencyFormatter.format(discount)}`);
      if (Number(invoiceData.taxRate) > 0) addTotalLine(`Tax (${invoiceData.taxRate}%):`, currencyFormatter.format(taxAmount));
      if (shipping > 0) addTotalLine('Shipping:', currencyFormatter.format(shipping));
      
      // Add extra space before the line so it doesn't overlap text
      finalY += 5;

      // Divider line
      doc.setDrawColor(...hexToRgb(style.borderColor));
      doc.line(pageWidth - margin - 200, finalY, pageWidth - margin, finalY);
      
      // Add space AFTER line for the Total Text
      finalY += 20;

      // Grand Total
      doc.setFontSize(12);
      doc.setTextColor(...hexToRgb(style.primaryColor));
      addTotalLine('Total:', currencyFormatter.format(total), true);
      doc.setTextColor(...hexToRgb(style.textColor));

      // --- 5. Notes & Signature ---
      // Position notes on the left, aligned with totals roughly
      let notesY = (doc as any).autoTable.previous.finalY + 20; 
      if (notesY + 100 > pageHeight) { doc.addPage(); notesY = margin; }

      if (invoiceData.notes) {
          doc.setFontSize(10);
          doc.setFont(style.font, 'bold');
          doc.text('Note:', margin, notesY);
          notesY += 15;
          doc.setFont(style.font, 'normal');
          const noteLines = doc.splitTextToSize(invoiceData.notes, pageWidth/2); // Half width to not hit totals
          doc.text(noteLines, margin, notesY);
          notesY += (noteLines.length * 12) + 20;
      }

      // Signature
      if (invoiceData.signatureUrl) {
         // Ensure we have space, or push to new page
         if (notesY + 80 > pageHeight - margin) { doc.addPage(); notesY = margin; }
         
         try {
             const sigImg = await loadImage(invoiceData.signatureUrl);
             if (sigImg) {
                 doc.addImage(sigImg.data, sigImg.format, margin, notesY, 120, 40);
                 doc.line(margin, notesY + 45, margin + 120, notesY + 45); // Signature line
                 doc.setFontSize(9);
                 doc.text("Authorized Signature", margin, notesY + 55);
             }
         } catch (e) { console.warn("Sig error", e); }
      }

      // Payment Link
      if (invoiceData.paypalLink) {
         // Add button at bottom center
         const btnY = pageHeight - margin - 40;
         doc.setFillColor(255, 196, 58);
         doc.roundedRect(pageWidth/2 - 70, btnY, 140, 35, 4, 4, 'F');
         doc.setFontSize(12);
         doc.setTextColor(0, 0, 0);
         doc.text("Pay Now", pageWidth/2, btnY + 22, { align: 'center' });
         doc.link(pageWidth/2 - 70, btnY, 140, 35, { url: invoiceData.paypalLink });
      }

      doc.save(`Invoice-${invoiceData.invoiceNumber}.pdf`);
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

      // Header
      let yPos = await addHeader(doc, profile, 'DAILY JOB REPORT', 'Date', data.date, style);
      
      // Meta Grid
      doc.setFontSize(10);
      doc.setFont(style.font, 'bold');
      doc.setTextColor(...hexToRgb(style.primaryColor));
      
      doc.text("PROJECT DETAILS", margin, yPos);
      yPos += 15;
      doc.setDrawColor(...hexToRgb(style.borderColor));
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 15;

      doc.setTextColor(...hexToRgb(style.textColor));
      doc.setFont(style.font, 'normal');
      doc.text(`Project: ${data.projectName}`, margin, yPos);
      doc.text(`Report #: ${data.reportNumber}`, pageWidth/2, yPos);
      yPos += 15;
      if (data.clientName) {
        doc.text(`Client: ${data.clientName}`, margin, yPos);
        yPos += 15;
      }
      if (data.weather) {
          doc.text(`Weather: ${data.weather} ${data.temperature ? `(${data.temperature})` : ''}`, margin, yPos);
          yPos += 25;
      }

      // Content
      const contentElement = document.getElementById('pdf-render-content');
      if (contentElement) {
          // IMPORTANT: Move the container on-screen and make visible during rendering
          contentElement.style.left = '0px';
          contentElement.style.top = '0px';
          contentElement.style.zIndex = '-1000'; // HIDDEN FROM USER, VISIBLE TO RENDERER
          contentElement.style.opacity = '1';
          contentElement.style.visibility = 'visible';
          // Reset styles to avoid inherited drift
          contentElement.style.padding = '0';
          contentElement.style.margin = '0';
          contentElement.style.boxSizing = 'border-box';
          contentElement.style.backgroundColor = 'white';

          // Use a wider virtual width to allow side-by-side elements
          // A4 printable width (approx 515pt) is narrow. 750px allows two ~350px images side-by-side.
          const virtualWidth = 750; 
          const pdfBodyWidth = pageWidth - (margin * 2);

          contentElement.style.width = `${virtualWidth}px`;

          // Inject content with explicit styling for PDF rendering
          // Increase font size to 14px to compensate for scaling down (750px -> ~515px)
          contentElement.innerHTML = `
            <div style="
                font-family: ${style.font === 'times' ? 'serif' : style.font === 'courier' ? 'monospace' : 'sans-serif'}; 
                font-size: 14px; 
                color: ${style.textColor}; 
                width: 100%;
                word-wrap: break-word; 
                overflow-wrap: break-word;
                box-sizing: border-box;
            ">
                ${data.content}
            </div>`;
          
          // Wait a tick to ensure DOM update
          await new Promise(r => setTimeout(r, 100));

          await (doc as any).html(contentElement, {
            x: margin,
            y: yPos,
            width: pdfBodyWidth, // Fit the virtual container into the PDF width
            windowWidth: virtualWidth, // Render with this wider viewport
            autoPaging: 'text',
            callback: async (doc: any) => {
               // HIDE IT AGAIN
               contentElement.style.left = '-9999px';
               contentElement.innerHTML = ''; // Clear content

               const finalY = (doc as any).internal.getCurrentPageInfo().pageContext.y || (pageHeight - 100);
               let sigY = finalY + 40;
               if (sigY + 80 > pageHeight - margin) { doc.addPage(); sigY = margin; }

               if (data.signatureUrl) {
                 try {
                     const sigImg = await loadImage(data.signatureUrl);
                     if (sigImg) {
                         doc.addImage(sigImg.data, sigImg.format, margin, sigY, 120, 40);
                         doc.line(margin, sigY + 45, margin + 120, sigY + 45);
                         doc.setFontSize(9);
                         doc.text("Signed", margin, sigY + 55);
                     }
                 } catch (e) {}
               }
               doc.save(`${data.reportNumber}.pdf`);
               resolve();
            }
          });
      } else {
          // Fallback if no HTML content
          doc.save(`${data.reportNumber}.pdf`);
          resolve();
      }
    } catch (err) { reject(err); }
   });
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    // Use 'pt' to match other generators for consistency and simpler math
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    
    await addHeader(doc, profile, 'NOTE', 'Date', new Date().toLocaleDateString(), style);
    
    doc.setFontSize(18);
    doc.text(data.title, margin, 150);
    
    const contentElement = document.getElementById('pdf-render-content');
    if (contentElement) {
        // Move container on-screen for capture
        contentElement.style.left = '0px';
        contentElement.style.top = '0px';
        contentElement.style.zIndex = '-1000'; // HIDDEN FROM USER, VISIBLE TO RENDERER
        contentElement.style.opacity = '1';
        contentElement.style.visibility = 'visible';
        // Reset styles
        contentElement.style.padding = '0';
        contentElement.style.margin = '0';
        contentElement.style.boxSizing = 'border-box';
        contentElement.style.backgroundColor = 'white';

        // Virtual Layout Strategy for Side-by-Side
        const virtualWidth = 750;
        const pdfBodyWidth = pageWidth - (margin * 2);
        
        contentElement.style.width = `${virtualWidth}px`;

        contentElement.innerHTML = `
            <div style="
                font-family: sans-serif; 
                width: 100%;
                font-size: 14px;
                word-wrap: break-word; 
                overflow-wrap: break-word;
                box-sizing: border-box;
            ">
                ${data.content}
            </div>`;
        
        // Wait for rendering
        await new Promise(r => setTimeout(r, 100));

        await (doc as any).html(contentElement, {
            x: margin,
            y: 170,
            width: pdfBodyWidth, 
            windowWidth: virtualWidth,
            autoPaging: 'text',
            callback: function (doc: any) {
                // Hide again
                contentElement.style.left = '-9999px';
                contentElement.innerHTML = '';

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

    doc.setFontSize(14); 
    doc.setFont(style.headerFont, 'bold'); 
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Project: ${job.name}`, margin, yPos);
    yPos += 20;
    doc.setFontSize(12); 
    doc.setFont(style.font, 'normal'); 
    doc.setTextColor(...hexToRgb(style.textColor));
    doc.text(`Client: ${job.clientName}`, margin, yPos);
    yPos += 30;

    doc.setFont(style.font, 'bold'); doc.text('Description:', margin, yPos); yPos += 20;
    doc.setFont(style.font, 'normal');
    const descLines = doc.splitTextToSize(data.description, doc.internal.pageSize.getWidth() - 2 * margin);
    doc.text(descLines, margin, yPos);
    yPos += descLines.length * 15 + 20;

    if (data.materialsUsed) {
        doc.setFont(style.font, 'bold'); doc.text('Materials Used:', margin, yPos); yPos += 20;
        doc.setFont(style.font, 'normal');
        const matLines = doc.splitTextToSize(data.materialsUsed, doc.internal.pageSize.getWidth() - 2 * margin);
        doc.text(matLines, margin, yPos);
        yPos += matLines.length * 15 + 30;
    }
    
    // Totals Box
    doc.setFillColor(...hexToRgb(style.alternateRowColor));
    doc.rect(margin, yPos, doc.internal.pageSize.getWidth() - 2*margin, 50, 'F');
    yPos += 30;

    doc.setFont(style.font, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Hours: ${data.hours}`, margin + 20, yPos);
    doc.text(`Total Cost: $${Number(data.cost).toFixed(2)}`, doc.internal.pageSize.getWidth() - margin - 20, yPos, { align: 'right' });

    yPos += 60;

    if (data.signatureUrl) {
        try {
            const sigImg = await loadImage(data.signatureUrl);
            if (sigImg) {
                doc.addImage(sigImg.data, sigImg.format, margin, yPos, 120, 40);
                doc.line(margin, yPos + 45, margin + 120, yPos + 45);
                doc.setFontSize(10);
                doc.setTextColor(...hexToRgb(style.textColor));
                doc.text("Authorized Signature", margin, yPos + 55);
            }
        } catch (e) {}
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
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(getContrastColor(style.primaryColor)) },
    });
    doc.save(`TimeSheet.pdf`);
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
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(getContrastColor(style.primaryColor)) },
        bodyStyles: { valign: 'top' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 40, halign: 'center' },
            3: { cellWidth: 60, halign: 'right' },
            4: { cellWidth: 60, halign: 'right' }
        }
    });

    doc.save(`MaterialLog.pdf`);
};

export const generateEstimatePDF = async (profile: UserProfile, job: Job, data: EstimateData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    
    // --- Header ---
    const headerHeight = 100;
    if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
    }
    // Logo
    if (profile.logoUrl) {
        try {
            const imgData = await loadImage(profile.logoUrl);
            if (imgData) {
                const aspectRatio = imgData.width / imgData.height;
                let imgHeight = 70; let imgWidth = 70 * aspectRatio;
                if(imgWidth > 140) { imgWidth = 140; imgHeight = imgWidth/aspectRatio; }
                doc.addImage(imgData.data, imgData.format, margin, (headerHeight-imgHeight)/2, imgWidth, imgHeight);
            }
        } catch(e) {}
    }
    // Title & Meta (Clean Columns)
    doc.setFontSize(24); doc.setFont(style.headerFont, 'bold'); doc.setTextColor(...hexToRgb(style.headerTextColor));
    doc.text('ESTIMATE', pageWidth - margin, 45, { align: 'right' });
    
    doc.setFontSize(10);
    // Smart spacing
    let metaY = 65;
    const lineHeight = 15;
    const rightColX = pageWidth - margin;

    drawSmartLabelValue(doc, 'Estimate #:', data.estimateNumber, metaY, rightColX, style.font);
    metaY += lineHeight;
    drawSmartLabelValue(doc, 'Date:', data.issueDate, metaY, rightColX, style.font);
    metaY += lineHeight;
    drawSmartLabelValue(doc, 'Expires:', data.expiryDate, metaY, rightColX, style.font);

    // Info Grid
    let yPos = headerHeight + 30;
    doc.setTextColor(...hexToRgb(style.textColor));
    doc.setFontSize(10); doc.setFont(style.font, 'bold');
    doc.text('FROM', margin, yPos);
    doc.text('TO', pageWidth/2 + 20, yPos);
    yPos += 15;
    
    doc.setFontSize(11); doc.setFont(style.font, 'normal');
    doc.text(profile.companyName, margin, yPos);
    doc.text(job.clientName, pageWidth/2 + 20, yPos);
    yPos += 15;
    
    const companyLines = doc.splitTextToSize(profile.address || '', pageWidth/2 - margin - 20);
    doc.text(companyLines, margin, yPos);
    
    const clientLines = doc.splitTextToSize(job.clientAddress || '', pageWidth/2 - margin - 20);
    doc.text(clientLines, pageWidth/2 + 20, yPos);
    
    yPos += Math.max(companyLines.length, clientLines.length) * 15 + 20;

    const tableData = data.lineItems.map(item => [item.description, item.quantity, `$${Number(item.rate).toFixed(2)}`, `$${(item.quantity * item.rate).toFixed(2)}`]);

    (doc as any).autoTable({
        startY: yPos,
        head: [['Description', 'Quantity', 'Rate', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: hexToRgb(style.secondaryColor), 
            textColor: hexToRgb(getContrastColor(style.secondaryColor)) 
        },
        bodyStyles: { valign: 'top' },
        styles: { overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 65, halign: 'center' }, // Increased to 65 to fit "Quantity"
            2: { cellWidth: 70, halign: 'right' },
            3: { cellWidth: 70, halign: 'right' }
        }
    });
    
    const total = data.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    let finalY = (doc as any).autoTable.previous.finalY + 20;
    
    doc.setFont(style.font, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    // Smart alignment for Total
    drawSmartLabelValue(doc, 'Total Estimate:', `$${total.toFixed(2)}`, finalY, pageWidth - margin, style.font);
    
    finalY += 40;
    if(data.terms) {
        doc.setTextColor(...hexToRgb(style.textColor));
        doc.setFont(style.font, 'bold'); doc.text('Terms & Conditions:', margin, finalY); finalY += 15;
        doc.setFont(style.font, 'normal'); doc.setFontSize(10);
        const termLines = doc.splitTextToSize(data.terms, pageWidth - 2*margin);
        doc.text(termLines, margin, finalY);
        finalY += 20 + (termLines.length * 10);
    }

    if (data.signatureUrl) {
        try {
            const sigImg = await loadImage(data.signatureUrl);
            if (sigImg) {
                doc.addImage(sigImg.data, sigImg.format, margin, finalY, 120, 40);
                doc.line(margin, finalY + 45, margin + 120, finalY + 45);
                doc.text("Accepted By", margin, finalY + 55);
            }
        } catch (e) {}
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
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(getContrastColor(style.primaryColor)) },
    });

    doc.save(`Expense.pdf`);
};

export const generateWarrantyPDF = async (profile: UserProfile, job: Job, data: WarrantyData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'WARRANTY CERTIFICATE', 'Date', data.completedDate, style);

    doc.setDrawColor(...hexToRgb(style.primaryColor));
    doc.setLineWidth(2);
    doc.rect(20, 20, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 40);

    doc.setFontSize(12);
    doc.text(`Project: ${job.name}`, margin, yPos); yPos += 20;
    doc.text(`Client: ${job.clientName}`, margin, yPos); yPos += 40;
    
    doc.setFont(style.font, 'bold');
    doc.text(`Warranty Duration: ${data.duration}`, margin, yPos); yPos += 30;
    
    doc.text('Coverage:', margin, yPos); yPos += 15;
    doc.setFont(style.font, 'normal');
    const coverageLines = doc.splitTextToSize(data.coverage, doc.internal.pageSize.getWidth() - 2*margin);
    doc.text(coverageLines, margin, yPos);
    yPos += coverageLines.length * 15 + 30; 
    
    doc.setFont(style.font, 'bold');
    doc.text('Conditions:', margin, yPos); yPos += 15;
    doc.setFont(style.font, 'normal');
    const conditionLines = doc.splitTextToSize(data.conditions, doc.internal.pageSize.getWidth() - 2*margin);
    doc.text(conditionLines, margin, yPos);
    yPos += conditionLines.length * 15 + 40;
    
    if (data.signatureUrl) {
        try {
            const sigImg = await loadImage(data.signatureUrl);
            if (sigImg) {
                doc.addImage(sigImg.data, sigImg.format, margin, yPos, 120, 40);
                doc.line(margin, yPos + 45, margin + 120, yPos + 45);
                doc.text("Authorized Signature", margin, yPos + 55);
            }
        } catch (e) {}
    }

    doc.save(`Warranty.pdf`);
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
    const descLines = doc.splitTextToSize(data.description, doc.internal.pageSize.getWidth() - 2 * margin);
    doc.text(descLines, margin, yPos);

    doc.save(`Receipt-${data.date}.pdf`);
};
