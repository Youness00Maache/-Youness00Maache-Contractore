import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData } from '../types';

declare const jspdf: any;
declare const html2canvas: any;

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoiceData: InvoiceData) => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let yPos = margin;

  // Function to add logo from either base64 data URL or a remote URL
  const addLogo = async () => {
    const logoSource = invoiceData.logoUrl || profile.logoUrl;
    if (logoSource) {
      try {
        let dataUrl = logoSource;
        // If it's a remote URL, fetch it and convert to base64
        if (!logoSource.startsWith('data:image/')) {
          const response = await fetch(logoSource);
          const blob = await response.blob();
          const reader = new FileReader();
          dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        
        const img = new Image();
        const imgLoadPromise = new Promise((resolve) => { img.onload = resolve; });
        img.src = dataUrl;
        await imgLoadPromise;
        
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const imgWidth = 80;
        const imgHeight = imgWidth / aspectRatio;
        doc.addImage(dataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      } catch (e) {
        console.error("Error adding image to PDF. Check CORS policy on the image URL.", e);
      }
    }
  };

  await addLogo();
  yPos = margin; // Reset yPos for header text

  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth - margin, yPos + 20, { align: 'right' });
  
  yPos += 80;

  // Use invoice-specific data with fallbacks to profile/job data
  const companyName = invoiceData.companyName || profile.companyName;
  const companyAddress = invoiceData.companyAddress || profile.address;
  const companyPhone = invoiceData.companyPhone || profile.phone;
  const companyWebsite = invoiceData.companyWebsite || profile.website;
  const clientName = invoiceData.clientName || job.clientName;
  const clientAddress = invoiceData.clientAddress || job.clientAddress;

  // Company Details (left)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, margin, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 15;
  if(companyAddress) { doc.text(companyAddress, margin, yPos, { maxWidth: pageWidth / 2.5 }); yPos += 15 * (doc.getTextDimensions(companyAddress, { maxWidth: pageWidth / 2.5 }).h / 10); }
  if(companyPhone) { doc.text(companyPhone, margin, yPos); yPos += 15; }
  if(companyWebsite) { doc.text(companyWebsite, margin, yPos, { style: 'link' }); }

  // Bill To & Invoice Info (right)
  let rightColY = margin + 80; 
  const rightColX = pageWidth / 2;
  
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', rightColX, rightColY);
  doc.setFont('helvetica', 'normal');
  rightColY += 15;
  doc.text(clientName, rightColX, rightColY);
  rightColY += 15;
  doc.text(clientAddress, rightColX, rightColY, { maxWidth: pageWidth / 2 - margin });
  
  rightColY = margin + 80;
  const labelX = pageWidth - margin - 100;
  const valueX = pageWidth - margin;

  doc.setFont('helvetica', 'bold'); doc.text('Invoice #:', labelX, rightColY);
  doc.setFont('helvetica', 'normal'); doc.text(invoiceData.invoiceNumber, valueX, rightColY, { align: 'right' });
  rightColY += 15;
  doc.setFont('helvetica', 'bold'); doc.text('Issue Date:', labelX, rightColY);
  doc.setFont('helvetica', 'normal'); doc.text(invoiceData.issueDate, valueX, rightColY, { align: 'right' });
  rightColY += 15;
  doc.setFont('helvetica', 'bold'); doc.text('Due Date:', labelX, rightColY);
  doc.setFont('helvetica', 'normal'); doc.text(invoiceData.dueDate, valueX, rightColY, { align: 'right' });

  yPos = Math.max(yPos, rightColY) + 40;

  // Line Items Table
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
    headStyles: { fillColor: [34, 34, 34] }, // Dark grey header
    styles: { fontSize: 10, cellPadding: 8 },
    margin: { left: margin, right: margin }
  });

  yPos = (doc as any).autoTable.previous.finalY + 30;

  // Totals
  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const subtotal = invoiceData.lineItems.reduce((acc, item) => acc + item.quantity * item.rate, 0);
  const discount = invoiceData.discount || 0;
  const shipping = invoiceData.shipping || 0;
  const amountAfterDiscount = subtotal - discount;
  const taxAmount = amountAfterDiscount * ((invoiceData.taxRate || 0) / 100);
  const total = amountAfterDiscount + taxAmount + shipping;

  const totalsX = pageWidth - margin - 200;
  doc.setFontSize(10);
  const addTotalLine = (label: string, value: string, isBold: boolean = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(label, totalsX, yPos);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(value, pageWidth - margin, yPos, { align: 'right' });
    yPos += 20;
  };

  addTotalLine('Subtotal:', currencyFormatter.format(subtotal));
  if (discount > 0) addTotalLine('Discount:', `- ${currencyFormatter.format(discount)}`);
  if(invoiceData.taxRate > 0) addTotalLine(`Tax (${invoiceData.taxRate}%):`, currencyFormatter.format(taxAmount));
  if (shipping > 0) addTotalLine('Shipping:', currencyFormatter.format(shipping));
  
  yPos += 5;
  doc.setDrawColor(180);
  doc.setLineWidth(1.5);
  doc.line(totalsX - 10, yPos - 10, pageWidth - margin, yPos - 10);
  
  doc.setFontSize(12);
  addTotalLine('Total:', currencyFormatter.format(total), true);

  // Notes
  if (invoiceData.notes) {
    yPos = (doc as any).autoTable.previous.finalY + 30; // Reset yPos to be relative to the table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', margin, yPos);
    yPos += 15;
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceData.notes, margin, yPos, { maxWidth: pageWidth / 2.2 });
  }

  // Save PDF
  doc.save(`Invoice-${invoiceData.invoiceNumber}-${clientName}.pdf`);
};

 const showNotImplementedAlert = (docType: string) => {
     alert(`${docType} PDF generation is not implemented yet.`);
 }
export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, template: 'minimal' | 'bordered' | 'modern') => {
   const { jsPDF } = jspdf;
   const doc = new jsPDF('p', 'pt', 'a4');
   const pageWidth = doc.internal.pageSize.getWidth();
   const pageHeight = doc.internal.pageSize.getHeight();
   const margin = 40;

   // Use report-specific data with fallbacks to profile data
   const companyName = data.companyName || profile.companyName;
   const companyAddress = data.companyAddress || profile.address;
   const companyPhone = data.companyPhone || profile.phone;
   const companyWebsite = data.companyWebsite || profile.website;

   const addLogo = async (yStart: number, xStart: number = margin, maxWidth: number = 60) => {
    let logoHeight = 0;
    const logoUrl = data.logoUrl || profile.logoUrl;
    if (logoUrl) {
      try {
        let dataUrl = logoUrl;
        if (!logoUrl.startsWith('data:image/')) {
            const response = await fetch(logoUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        
        const img = new Image();
        const imgLoadPromise = new Promise((resolve) => { img.onload = resolve; });
        img.src = dataUrl;
        await imgLoadPromise;
        
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const imgWidth = Math.min(maxWidth, 80);
        const imgHeight = imgWidth / aspectRatio;
        doc.addImage(dataUrl, 'PNG', xStart, yStart, imgWidth, imgHeight);
        logoHeight = imgHeight;
      } catch (e) {
        console.error("Error adding image to PDF:", e);
      }
    }
    return logoHeight;
   };
   
   const addCompanyInfo = (yStart: number) => {
      let y = yStart;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, margin, y);
      y += 15;
      doc.setFont('helvetica', 'normal');
      if (companyAddress) {
          const addressLines = doc.splitTextToSize(companyAddress, pageWidth / 3);
          doc.text(addressLines, margin, y);
          y += 15 * addressLines.length;
      }
      if (companyPhone) {
          doc.text(companyPhone, margin, y);
          y += 15;
      }
      if (companyWebsite) {
          doc.text(companyWebsite, margin, y);
          y += 15;
      }
      return y;
   }

   const addHeader = (title: string, y: number) => {
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth - margin, y, { align: 'right'});
   }

   const addFooter = () => {
       const pageCount = (doc as any).internal.getNumberOfPages();
       doc.setFontSize(8);
       doc.setFont('helvetica', 'normal');
       for (let i = 1; i <= pageCount; i++) {
           doc.setPage(i);
           doc.text(`Page ${i} of ${pageCount}`, margin, pageHeight - margin / 2);
           doc.text(`${companyName} | Daily Job Report`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
           doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - margin / 2, { align: 'right' });
       }
   };
   
   if (template === 'minimal') {
      await addLogo(margin, pageWidth - margin - 60, 60);
      addHeader('Daily Job Report', margin + 20);
      let yPos = addCompanyInfo(margin + 20);

      yPos = Math.max(yPos, margin + 80);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const addInfoLine = (label: string, value: string, y: number, x: number) => {
          doc.text(`${label}:`, x, y);
          doc.setFont('helvetica', 'normal');
          doc.text(value, x + 70, y, { maxWidth: pageWidth / 2.5 - 70 });
          doc.setFont('helvetica', 'bold');
          return y + 18;
      };
      
      let rightColY = margin + 80;
      const rightColX = pageWidth / 2;
      addInfoLine('Project', data.projectName, rightColY, rightColX);
      addInfoLine('Client', data.clientName, rightColY + 18, rightColX);
      addInfoLine('Address', data.projectAddress, rightColY + 36, rightColX);
      addInfoLine('Report #', data.reportNumber, rightColY + 72, rightColX);
      addInfoLine('Date', data.date, rightColY + 90, rightColX);

      yPos = Math.max(yPos, rightColY + 120);

      doc.setDrawColor(200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 20;

      const contentElement = document.getElementById('pdf-render-content');
      if (contentElement) {
        contentElement.innerHTML = data.content;
        await (doc as any).html(contentElement, {
          x: margin,
          y: yPos,
          width: pageWidth - (margin * 2),
          windowWidth: 600,
          callback: () => {
            addFooter();
            doc.save(`${data.reportNumber}.pdf`);
          }
        });
      }

   } else if (template === 'bordered') {
      const borderColor = [60, 60, 60];
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(2);
      doc.rect(margin/2, margin/2, pageWidth - margin, pageHeight - margin);

      await addLogo(margin + 10, pageWidth - margin - 70, 60);
      addHeader('Daily Job Report', margin + 30);
      let yPos = addCompanyInfo(margin + 30);

      yPos = Math.max(yPos, margin + 80);
      
      const drawInfoBox = (title: string, info: {label: string, value: string}[]) => {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, yPos, pageWidth - margin * 2, 20, 'F');
          doc.setTextColor(50, 50, 50);
          doc.text(title, margin + 10, yPos + 14);
          yPos += 20;
          
          doc.setFontSize(10);
          info.forEach(({label, value}) => {
             yPos += 18;
             doc.setFont('helvetica', 'bold');
             doc.text(label, margin + 10, yPos);
             doc.setFont('helvetica', 'normal');
             doc.text(value, margin + 110, yPos, { maxWidth: pageWidth - margin * 2 - 120 });
          });
          yPos += 10;
      }
      
      drawInfoBox('Project Details', [
          {label: 'Project Name', value: data.projectName},
          {label: 'Client Name', value: data.clientName},
          {label: 'Address', value: data.projectAddress},
          {label: 'Report #', value: data.reportNumber},
          {label: 'Date', value: data.date},
      ]);
      
      yPos += 10;
      
      const contentElement = document.getElementById('pdf-render-content');
      if (contentElement) {
        contentElement.innerHTML = `<div style="padding: 5px;">${data.content}</div>`;
        await (doc as any).html(contentElement, {
          x: margin,
          y: yPos,
          width: pageWidth - (margin * 2),
          windowWidth: 600,
          callback: () => {
            addFooter();
            doc.save(`${data.reportNumber}.pdf`);
          }
        });
      }

   } else { // Modern template
      doc.setFillColor(34, 34, 34); // Dark header
      doc.rect(0, 0, pageWidth, 90, 'F');

      await addLogo(20, margin, 50);

      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Daily Job Report', pageWidth - margin, 55, { align: 'right' });
      
      let yPos = 120;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 150, 150);
      doc.text('FROM', margin, yPos);
      doc.text('TO', pageWidth/2, yPos);
      yPos += 14;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(34, 34, 34);
      
      doc.text(companyName, margin, yPos);
      doc.text(data.clientName, pageWidth/2, yPos);
      yPos += 14;
      
      doc.setFontSize(9);
      doc.text(companyAddress, margin, yPos, { maxWidth: pageWidth / 2.5 - margin });
      doc.text(data.projectAddress, pageWidth/2, yPos, { maxWidth: pageWidth / 2.5 - margin });

      yPos = Math.max(yPos, 120) + 45;

      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(1);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 25;

      const contentElement = document.getElementById('pdf-render-content');
      if (contentElement) {
        contentElement.innerHTML = `<div style="font-family: Arial, sans-serif; font-size: 10pt;">${data.content}</div>`;
        await (doc as any).html(contentElement, {
          x: margin,
          y: yPos,
          width: pageWidth - (margin * 2),
          windowWidth: 600,
          callback: () => {
            addFooter();
            doc.save(`${data.reportNumber}.pdf`);
          }
        });
      }
   }
};

export const generateNotePDF = (profile: UserProfile, job: Job, data: NoteData) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text(data.title, 20, 20);
    doc.setFontSize(12);
    const contentElement = document.getElementById('pdf-render-content');
    if (contentElement) {
        contentElement.innerHTML = data.content;
        (doc as any).html(contentElement, {
            x: 20,
            y: 30,
            callback: function (doc: any) {
                doc.save(`Note-${data.title}.pdf`);
            }
        });
    }
};

export const generateWorkOrderPDF = (profile: UserProfile, job: Job, data: WorkOrderData) => showNotImplementedAlert('Work Order');
export const generateTimeSheetPDF = (profile: UserProfile, job: Job, data: TimeSheetData) => showNotImplementedAlert('Time Sheet');
export const generateMaterialLogPDF = (profile: UserProfile, job: Job, data: MaterialLogData) => showNotImplementedAlert('Material Log');
export const generateEstimatePDF = (profile: UserProfile, job: Job, data: EstimateData) => showNotImplementedAlert('Estimate');
export const generateExpenseLogPDF = (profile: UserProfile, job: Job, data: ExpenseLogData) => showNotImplementedAlert('Expense Log');
export const generateWarrantyPDF = (profile: UserProfile, job: Job, data: WarrantyData) => showNotImplementedAlert('Warranty');
export const generateReceiptPDF = (profile: UserProfile, job: Job, data: ReceiptData) => showNotImplementedAlert('Receipt');