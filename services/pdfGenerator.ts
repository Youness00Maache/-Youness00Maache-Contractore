import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData } from '../types';

declare const jspdf: any;
declare const html2canvas: any;

export const generateInvoicePDF = (profile: UserProfile, job: Job, invoiceData: InvoiceData) => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF();

  // ... (existing invoice PDF logic remains unchanged)
  // NOTE: For brevity, the existing unchanged code for generateInvoicePDF is omitted. 
  // It should be kept as it was in the previous version.
  const addHeader = () => {
    if (profile.logoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = function() {
          const canvas = document.createElement('canvas');
          // FIX: Use `img` instead of `this` to refer to the image element.
          // The context of `this` inside the onload function is not the image element.
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx!.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg');
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          const imgWidth = 30;
          const imgHeight = imgWidth / aspectRatio;
          doc.addImage(dataUrl, 'JPEG', 15, 10, imgWidth, imgHeight);
          addContent();
          saveDoc();
        };
        img.onerror = function() {
          console.error("Could not load image for PDF.");
          doc.text("Logo", 25, 25);
          addContent();
          saveDoc();
        };
        img.src = profile.logoUrl;
      } catch (e) {
        console.error("Error adding image to PDF:", e);
        doc.text("Logo", 25, 25);
        addContent();
        saveDoc();
      }
    } else {
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text(profile.companyName, 15, 20);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(profile.address || '', 15, 28);
        doc.text(profile.phone || '', 15, 33);
        doc.text(profile.website || '', 15, 38);
        addContent();
        saveDoc();
    }
  };
  
  const addContent = () => {
    // ... (rest of the function is unchanged)
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('BILL TO', 15, 60);
    doc.setFont(undefined, 'normal');
    doc.text(job.clientName, 15, 68);
    doc.text(job.clientAddress, 15, 74);
  };
  
  const saveDoc = () => {
    doc.save(`Invoice-${invoiceData.invoiceNumber}-${job.clientName}.pdf`);
  };

  addHeader();
};


const showNotImplementedAlert = (docType: string) => {
    alert(`${docType} PDF generation is not implemented yet.`);
}

export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, template: 'minimal' | 'bordered' | 'modern') => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let yPos = margin;

  const fonts = {
    modern: { normal: 'Helvetica', bold: 'Helvetica-Bold' },
    bordered: { normal: 'Times-Roman', bold: 'Times-Bold' },
    minimal: { normal: 'Helvetica', bold: 'Helvetica-Bold' }
  };
  const themeFonts = fonts[template];
  doc.setFont(themeFonts.normal);

  if (template === 'bordered') {
    doc.setDrawColor(0);
    doc.setLineWidth(2);
    doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin);
    doc.setLineWidth(0.5);
    doc.rect(margin / 2 + 4, margin / 2 + 4, pageWidth - margin - 8, pageHeight - margin - 8);
  }

  if (data.logoUrl) {
    try {
      const img = new Image();
      img.src = data.logoUrl;
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
      const logoWidth = 70;
      const logoHeight = (img.naturalHeight * logoWidth) / img.naturalWidth;
      doc.addImage(data.logoUrl, 'PNG', margin, yPos, logoWidth, logoHeight);
    } catch(e) { console.error("Could not add logo", e); }
  }

  const headerTextX = pageWidth - margin;
  if (template === 'modern') {
    doc.setFillColor(41, 128, 185);
    doc.rect(pageWidth / 2 - 20, yPos - 10, pageWidth / 2 + 60, 50, 'F');
    doc.setFontSize(24);
    doc.setFont(themeFonts.bold);
    doc.setTextColor(255, 255, 255);
    doc.text('Daily Job Report', headerTextX, yPos + 25, { align: 'right' });
    yPos += 40;
  } else {
    doc.setFontSize(22);
    doc.setFont(themeFonts.bold);
    doc.setTextColor(0, 0, 0);
    doc.text('Daily Job Report', headerTextX, yPos + 20, { align: 'right' });
  }

  doc.setFontSize(10);
  doc.setFont(themeFonts.normal);
  doc.setTextColor(80);
  doc.text(profile.companyName, headerTextX, yPos + 35, { align: 'right' });
  doc.text(profile.address, headerTextX, yPos + 48, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  yPos += 80;
  
  doc.setDrawColor(template === 'modern' ? 41 : (template === 'bordered' ? 0 : 200));
  doc.setLineWidth(template === 'modern' ? 2 : 1);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 25;

  const headerY = yPos;
  doc.setFontSize(11); doc.setFont(themeFonts.bold);
  doc.text('Project Name:', margin, headerY);
  doc.setFont(themeFonts.normal); doc.text(data.projectName, margin + 90, headerY);
  doc.setFont(themeFonts.bold);
  doc.text('Client:', margin, headerY + 20);
  doc.setFont(themeFonts.normal); doc.text(data.clientName, margin + 90, headerY + 20);
  doc.setFont(themeFonts.bold);
  doc.text('Address:', margin, headerY + 40);
  doc.setFont(themeFonts.normal); doc.text(data.projectAddress, margin + 90, headerY + 40, { maxWidth: pageWidth / 2 - margin - 90 });
  
  doc.setFont(themeFonts.bold);
  doc.text('Report #:', pageWidth / 2 + 20, headerY);
  doc.setFont(themeFonts.normal); doc.text(data.reportNumber, pageWidth / 2 + 90, headerY);
  doc.setFont(themeFonts.bold);
  doc.text('Date:', pageWidth / 2 + 20, headerY + 20);
  doc.setFont(themeFonts.normal); doc.text(new Date(data.date).toLocaleDateString(), pageWidth / 2 + 90, headerY + 20);
  doc.setFont(themeFonts.bold);
  doc.text('Weather:', pageWidth / 2 + 20, headerY + 40);
  doc.setFont(themeFonts.normal); doc.text(`${data.weather}, ${data.temperature}`, pageWidth / 2 + 90, headerY + 40);
  
  yPos = headerY + 65;
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 20;

  const editorElement = document.getElementById('pdf-render-content');
  if (!editorElement) { alert("Could not find content to render for PDF."); return; }
  
  editorElement.innerHTML = data.content;
  editorElement.style.display = 'block';
  editorElement.style.width = `${pageWidth - margin * 2}px`;
  editorElement.style.fontFamily = template === 'bordered' ? 'Times, serif' : 'Helvetica, sans-serif';
  editorElement.style.color = '#000';

  const links: { href: string; rect: DOMRect }[] = [];
  editorElement.querySelectorAll('a').forEach(a => {
    links.push({ href: a.href, rect: a.getBoundingClientRect() });
    const span = document.createElement('span');
    span.textContent = a.textContent;
    span.style.color = '#0000bb';
    span.style.textDecoration = 'underline';
    a.replaceWith(span);
  });
  
  const canvas = await html2canvas(editorElement, { scale: 2, useCORS: true });
  const editorRect = editorElement.getBoundingClientRect();

  editorElement.style.display = 'none';
  editorElement.innerHTML = '';

  const contentWidth = pageWidth - margin * 2;
  const contentHeight = (canvas.height * contentWidth) / canvas.width;
  
  const scaleX = contentWidth / editorRect.width;
  const scaleY = contentHeight / editorRect.height;
  
  let heightLeft = contentHeight;
  let canvasSourceY = 0; // The y-coordinate within the source canvas image
  let contentRenderedOnPdf = 0; // How much of the content's height has been rendered to the PDF
  let isFirstChunk = true;
  
  let finalY = yPos; // Keep track of the final Y position
  
  while (heightLeft > 0) {
    if (!isFirstChunk) {
        doc.addPage();
        yPos = margin;
    }
    
    let spaceLeftOnPage = pageHeight - yPos - margin;
    if (spaceLeftOnPage <= 0) { // Safety check in case the header fills the page
        doc.addPage();
        yPos = margin;
        spaceLeftOnPage = pageHeight - margin * 2;
    }

    const chunkHeightOnPdf = Math.min(heightLeft, spaceLeftOnPage);
    const chunkHeightOnCanvas = (chunkHeightOnPdf / contentHeight) * canvas.height;
    
    const canvasChunk = document.createElement('canvas');
    canvasChunk.width = canvas.width;
    canvasChunk.height = chunkHeightOnCanvas;
    const ctx = canvasChunk.getContext('2d');
    if (ctx) {
        ctx.drawImage(canvas, 0, canvasSourceY, canvas.width, chunkHeightOnCanvas, 0, 0, canvas.width, chunkHeightOnCanvas);
        
        const chunkImgData = canvasChunk.toDataURL('image/png');
        doc.addImage(chunkImgData, 'PNG', margin, yPos, contentWidth, chunkHeightOnPdf);

        links.forEach(link => {
            const linkRelativeY = (link.rect.top - editorRect.top) * scaleY;
            
            if (linkRelativeY >= contentRenderedOnPdf && linkRelativeY < (contentRenderedOnPdf + chunkHeightOnPdf)) {
                const pdfX = margin + (link.rect.left - editorRect.left) * scaleX;
                const pdfY = yPos + (linkRelativeY - contentRenderedOnPdf);
                const pdfWidth = link.rect.width * scaleX;
                const pdfHeight = link.rect.height * scaleY;
                doc.link(pdfX, pdfY, pdfWidth, pdfHeight, { url: link.href });
            }
        });
    }
    
    heightLeft -= chunkHeightOnPdf;
    canvasSourceY += chunkHeightOnCanvas;
    contentRenderedOnPdf += chunkHeightOnPdf;
    finalY = yPos + chunkHeightOnPdf;
    
    isFirstChunk = false;
  }

  if(data.signatureUrl) {
    const signatureHeight = 50;
    const signatureSpacing = 40;
    if (finalY + signatureSpacing + signatureHeight > pageHeight - margin) {
        doc.addPage();
        finalY = margin;
    } else {
        finalY += signatureSpacing;
    }
    
    doc.setFont(themeFonts.bold);
    doc.text('Signature:', margin, finalY);
    try {
        const sigImg = new Image();
        sigImg.src = data.signatureUrl;
        await new Promise(resolve => { sigImg.onload = resolve; sigImg.onerror = resolve; });
        const sigWidth = 80;
        const sigHeight = (sigImg.naturalHeight * sigWidth) / sigImg.naturalWidth;
        doc.addImage(data.signatureUrl, 'PNG', margin, finalY + 5, sigWidth, sigHeight);
    } catch(e) { console.error("Could not add signature", e); }
  }
  
  doc.save(`DailyReport-${data.reportNumber}-${data.projectName}.pdf`);
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let yPos = margin;

    doc.setFontSize(22);
    doc.setFont('Helvetica', 'bold');
    doc.text(data.title, pageWidth / 2, yPos, { align: 'center', maxWidth: pageWidth - margin * 2 });
    yPos += doc.getTextDimensions(data.title, { maxWidth: pageWidth - margin * 2 }).h + 20;

    doc.setDrawColor(200);
    doc.setLineWidth(1);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 20;

    const editorElement = document.getElementById('pdf-render-content');
    if (!editorElement) {
        alert("Could not find content to render for PDF.");
        return;
    }

    editorElement.innerHTML = data.content;
    editorElement.style.display = 'block';
    editorElement.style.width = `${pageWidth - margin * 2}px`;
    editorElement.style.fontFamily = 'Helvetica, sans-serif';
    editorElement.style.color = '#000';

    const links: { href: string; rect: DOMRect }[] = [];
    editorElement.querySelectorAll('a').forEach(a => {
        links.push({ href: a.href, rect: a.getBoundingClientRect() });
        const span = document.createElement('span');
        span.textContent = a.textContent;
        span.style.color = '#0000bb';
        span.style.textDecoration = 'underline';
        a.replaceWith(span);
    });

    const canvas = await html2canvas(editorElement, { scale: 2, useCORS: true });
    const editorRect = editorElement.getBoundingClientRect();

    editorElement.style.display = 'none';
    editorElement.innerHTML = '';

    const contentWidth = pageWidth - margin * 2;
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    const scaleX = contentWidth / editorRect.width;
    const scaleY = contentHeight / editorRect.height;

    let heightLeft = contentHeight;
    let canvasSourceY = 0;
    let contentRenderedOnPdf = 0;
    let isFirstChunk = true;

    while (heightLeft > 0) {
        if (!isFirstChunk) {
            doc.addPage();
            yPos = margin;
        }

        let spaceLeftOnPage = pageHeight - yPos - margin;
        if (spaceLeftOnPage <= 0) {
            doc.addPage();
            yPos = margin;
            spaceLeftOnPage = pageHeight - margin * 2;
        }

        const chunkHeightOnPdf = Math.min(heightLeft, spaceLeftOnPage);
        const chunkHeightOnCanvas = (chunkHeightOnPdf / contentHeight) * canvas.height;

        const canvasChunk = document.createElement('canvas');
        canvasChunk.width = canvas.width;
        canvasChunk.height = chunkHeightOnCanvas;
        const ctx = canvasChunk.getContext('2d');
        if (ctx) {
            ctx.drawImage(canvas, 0, canvasSourceY, canvas.width, chunkHeightOnCanvas, 0, 0, canvas.width, chunkHeightOnCanvas);

            const chunkImgData = canvasChunk.toDataURL('image/png');
            doc.addImage(chunkImgData, 'PNG', margin, yPos, contentWidth, chunkHeightOnPdf);

            links.forEach(link => {
                const linkRelativeY = (link.rect.top - editorRect.top) * scaleY;
                if (linkRelativeY >= contentRenderedOnPdf && linkRelativeY < (contentRenderedOnPdf + chunkHeightOnPdf)) {
                    const pdfX = margin + (link.rect.left - editorRect.left) * scaleX;
                    const pdfY = yPos + (linkRelativeY - contentRenderedOnPdf);
                    const pdfWidth = link.rect.width * scaleX;
                    const pdfHeight = link.rect.height * scaleY;
                    doc.link(pdfX, pdfY, pdfWidth, pdfHeight, { url: link.href });
                }
            });
        }

        heightLeft -= chunkHeightOnPdf;
        canvasSourceY += chunkHeightOnCanvas;
        contentRenderedOnPdf += chunkHeightOnPdf;

        isFirstChunk = false;
    }

    const safeTitle = data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
    doc.save(`Note-${safeTitle || 'untitled'}.pdf`);
};


export const generateEstimatePDF = (profile: UserProfile, job: Job, data: EstimateData) => showNotImplementedAlert('Estimate');
export const generateWorkOrderPDF = (profile: UserProfile, job: Job, data: WorkOrderData) => showNotImplementedAlert('Work Order');
export const generateTimeSheetPDF = (profile: UserProfile, job: Job, data: TimeSheetData) => showNotImplementedAlert('Time Sheet');
export const generateMaterialLogPDF = (profile: UserProfile, job: Job, data: MaterialLogData) => showNotImplementedAlert('Material Log');
export const generateExpenseLogPDF = (profile: UserProfile, job: Job, data: ExpenseLogData) => showNotImplementedAlert('Expense Log');
export const generateWarrantyPDF = (profile: UserProfile, job: Job, data: WarrantyData) => showNotImplementedAlert('Warranty');
export const generateReceiptPDF = (profile: UserProfile, job: Job, data: ReceiptData) => showNotImplementedAlert('Receipt');