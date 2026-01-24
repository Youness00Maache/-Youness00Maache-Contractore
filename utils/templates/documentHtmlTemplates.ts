import { InvoiceData, EstimateData, UserProfile, Job, WorkOrderData, PurchaseOrderData, ProfitReportData } from '../../types';

// --- TEMPLATE 1: Modern Advanced (Single Page, Clean) ---
export const getAdvancedHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#000000';
    const secondaryColor = data.themeColors?.secondary || '#666666';

    // Helper to format currency
    const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

    // Safe strings
    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const companyWebsite = data.companyWebsite || profile.website || '';

    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    // Line Items
    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    // Generate Rows
    const rowsHtml = lineItems.map((item: any) => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 0; color: #333;">
                <div style="font-weight: 600; font-size: 14px;">${item.description}</div>
            </td>
            <td style="padding: 12px 0; text-align: center; color: #555;">${item.quantity}</td>
            <td style="padding: 12px 0; text-align: right; color: #555;">${formatMoney(item.rate)}</td>
            <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #333;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 100%; color: #333; line-height: 1.5;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid ${primaryColor};">
            <div style="flex: 1;">
                ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 80px; max-width: 200px; object-fit: contain; margin-bottom: 15px;" />`
            : `<h1 style="margin: 0; font-size: 28px; color: ${primaryColor};">${companyName}</h1>`
        }
                <div style="font-size: 13px; color: #666;">
                    ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                    ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                    ${companyWebsite ? `<div style="color: ${primaryColor};">${companyWebsite}</div>` : ''}
                </div>
            </div>
            <div style="text-align: right;">
                <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -1px; color: ${primaryColor}; text-transform: uppercase; line-height: 1;">${title}</h1>
                <div style="margin-top: 15px; font-size: 14px;">
                    <div style="margin-bottom: 4px;"><span style="color: #999; font-weight: 600; text-transform: uppercase; font-size: 11px;">${labels.id}</span> <span style="font-weight: 600;">${labels.idValue}</span></div>
                    <div><span style="color: #999; font-weight: 600; text-transform: uppercase; font-size: 11px;">${labels.date}</span> <span style="font-weight: 600;">${labels.dateValue}</span></div>
                </div>
            </div>
        </div>

        <!-- Client Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
            <div style="width: 45%;">
                <div style="font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Bill To</div>
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">${clientName}</div>
                <div style="font-size: 14px; color: #666;">${clientAddress}</div>
            </div>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
                <tr style="border-bottom: 2px solid #eee;">
                    <th style="text-align: left; padding: 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; font-weight: 700;">Description</th>
                    <th style="text-align: center; padding: 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; font-weight: 700; width: 80px;">Qty</th>
                    <th style="text-align: right; padding: 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; font-weight: 700; width: 100px;">Rate</th>
                    <th style="text-align: right; padding: 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; font-weight: 700; width: 100px;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <!-- Totals -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
            <div style="width: 250px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #666;">
                    <span>Subtotal</span>
                    <span>${formatMoney(subtotal)}</span>
                </div>
                ${data.discount ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #666;">
                    <span>Discount</span>
                    <span>-${formatMoney(data.discount)}</span>
                </div>` : ''}
                ${data.taxRate ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #666;">
                    <span>Tax (${data.taxRate}%)</span>
                    <span>${formatMoney(tax)}</span>
                </div>` : ''}
                <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px solid #eee; font-size: 18px; font-weight: 700; color: ${primaryColor};">
                    <span>Total</span>
                    <span>${formatMoney(total)}</span>
                </div>
            </div>
        </div>

        <!-- Notes -->
        ${data.notes ? `
        <div style="margin-top: 40px; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
            <div style="font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; margin-bottom: 8px;">Notes</div>
            <div style="font-size: 13px; color: #555;">${data.notes}</div>
        </div>` : ''}
        
        <div style="margin-top: 60px; text-align: center; font-size: 12px; color: #ccc; padding-top: 20px; border-top: 1px dashed #eee;">
            Authorized Document • ${companyName}
        </div>
    </div>
    `;
};

// --- TEMPLATE 2: Glassmorphism Modern (Ultra Premium Design) ---
// --- TEMPLATE 2: Glassmorphism Modern (Ultra Premium Design) ---
export const getGlassmorphismModernHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#2563EB'; // Blue as default
    const formattedDate = new Date(data.date).toLocaleDateString();

    // Calculate totals
    const subtotal = data.lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const taxAmount = (subtotal * (data.taxRate || 0)) / 100;
    const total = subtotal + taxAmount;

    // Helper for money format
    const formatMoney = (amount: number) => {
        return `$${Number(amount || 0).toFixed(2)}`;
    };

    const gradientStart = primaryColor;
    const gradientEnd = '#60A5FA'; // Lighter blue

    const lineItemsHtml = data.lineItems.map((item: any, index: number) => `
        <tr style="border-bottom: 1px solid rgba(0,0,0,0.1);">
            <td style="padding: 16px; color: #000000; font-weight: 500;">${item.description}</td>
            <td style="padding: 16px; text-align: center; color: #000000;">${item.quantity}</td>
            <td style="padding: 16px; text-align: right; color: #000000;">${formatMoney(item.rate)}</td>
            <td style="padding: 16px; text-align: right; font-weight: 600; color: #000000;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #000000; line-height: 1.5; background: #fff; width: 100%;">
        
        <!-- Header Section with Glass Effect Background -->
        <div style="background: linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%); padding: 40px; position: relative; overflow: hidden; color: white;">
            <!-- Glass Overlay Circles -->
            <div style="position: absolute; top: -50px; right: -50px; width: 300px; height: 300px; background: rgba(255,255,255,0.1); border-radius: 50%; backdrop-filter: blur(10px);"></div>
            <div style="position: absolute; bottom: -30px; left: 50px; width: 150px; height: 150px; background: rgba(255,255,255,0.1); border-radius: 50%; backdrop-filter: blur(5px);"></div>

            <div style="position: relative; z-index: 10; display: flex; justify-content: space-between; align-items: flex-start;">
                <!-- Left: Logo & Document Details -->
                <div style="flex: 1;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="height: 80px; object-fit: contain; background: rgba(255,255,255,0.9); padding: 5px; border-radius: 8px; margin-bottom: 16px;" />` : ''}
                    
                    <h1 style="font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; text-transform: uppercase;">${title}</h1>
                    <div style="margin-top: 8px; font-size: 16px; opacity: 0.95; font-weight: 600;">${labels.id} #${labels.idValue}</div>
                    <div style="font-size: 14px; opacity: 0.9; margin-top: 2px;">${formattedDate}</div>
                </div>

                <!-- Right: Company Info -->
                <div style="text-align: right; margin-top: 8px;">
                    <div style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">${profile.companyName}</div>
                    <div style="font-size: 13px; opacity: 0.95; line-height: 1.6;">${profile.address}</div>
                    <div style="font-size: 13px; opacity: 0.95; line-height: 1.6;">${profile.phone}</div>
                    <div style="font-size: 13px; opacity: 0.95; line-height: 1.6;">${profile.email}</div>
                </div>
            </div>
        </div>

        <!-- Client & Project Info -->
        <div style="display: flex; gap: 20px; padding: 30px 40px 20px 40px;">
            <div style="flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 20px;">
                <div style="font-size: 11px; text-transform: uppercase; color: ${primaryColor}; font-weight: 700; margin-bottom: 12px; letter-spacing: 1px;">Bill To</div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px; color: #000000;">${data.clientName || 'Client Name'}</div>
                <div style="color: #000000; font-size: 14px;">${data.clientAddress || ''}</div>
                <div style="color: #000000; font-size: 14px;">${data.clientPhone || ''}</div>
                <div style="color: #000000; font-size: 14px;">${data.clientEmail || ''}</div>
            </div>
            
            <div style="flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 20px;">
                <div style="font-size: 11px; text-transform: uppercase; color: ${primaryColor}; font-weight: 700; margin-bottom: 12px; letter-spacing: 1px;">Project Details</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #E5E7EB; padding-bottom: 4px;">
                    <span style="color: #000000; font-size: 13px;">Project Name</span>
                    <span style="font-weight: 600; color: #000000; font-size: 13px;">${data.projectName || data.title || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #E5E7EB; padding-bottom: 4px;">
                    <span style="color: #000000; font-size: 13px;">Issue Date</span>
                    <span style="font-weight: 600; color: #000000; font-size: 13px;">${formattedDate}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #000000; font-size: 13px;">Status</span>
                    <span style="font-weight: 600; color: ${primaryColor}; font-size: 13px;">${data.status || 'Active'}</span>
                </div>
            </div>
        </div>

        <!-- Items Table -->
        <div style="padding: 0 40px;">
            <table style="width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px;">
                <thead>
                    <tr style="background: ${primaryColor}; color: #000000;">
                        <th style="padding: 14px 16px; text-align: left; font-size: 12px; text-transform: uppercase; border-top-left-radius: 8px;">Description</th>
                        <th style="padding: 14px 16px; text-align: center; font-size: 12px; text-transform: uppercase; width: 80px;">Qty</th>
                        <th style="padding: 14px 16px; text-align: right; font-size: 12px; text-transform: uppercase; width: 100px;">Rate</th>
                        <th style="padding: 14px 16px; text-align: right; font-size: 12px; text-transform: uppercase; width: 120px; border-top-right-radius: 8px;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineItemsHtml}
                </tbody>
            </table>
        </div>

        <!-- Totals & Notes -->
        <div style="display: flex; justify-content: space-between; padding: 30px 40px; margin-top: 10px;">
            <div style="flex: 1; padding-right: 60px;">
                ${data.notes ? `
                <div style="background: #F9FAFB; border-left: 4px solid ${primaryColor}; padding: 15px; border-radius: 4px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${primaryColor}; margin-bottom: 6px;">Notes</div>
                    <div style="font-size: 13px; color: #000000; line-height: 1.6;">${data.notes}</div>
                </div>` : ''}
                
                ${data.terms ? `
                <div style="margin-top: 20px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #000000; margin-bottom: 6px;">Terms & Conditions</div>
                    <div style="font-size: 12px; color: #000000; line-height: 1.6;">${data.terms}</div>
                </div>` : ''}
            </div>

            <div style="width: 280px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
                    <span style="color: #000000;">Subtotal</span>
                    <span style="font-weight: 600; color: #000000;">${formatMoney(subtotal)}</span>
                </div>
                ${data.taxRate > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
                    <span style="color: #000000;">Tax (${data.taxRate}%)</span>
                    <span style="font-weight: 600; color: #000000;">${formatMoney(taxAmount)}</span>
                </div>` : ''}
                
                <div style="height: 1px; background: #E5E7EB; margin: 15px 0;"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 16px; font-weight: 700; color: ${primaryColor};">Total</span>
                    <span style="font-size: 24px; font-weight: 800; color: ${primaryColor};">${formatMoney(total)}</span>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #E5E7EB; margin: 0 40px; padding: 20px 0; text-align: center;">
            <div style="font-size: 12px; color: #000000;">Thank you for your business!</div>
            ${profile.website ? `<div style="font-size: 12px; color: ${primaryColor}; font-weight: 500; margin-top: 4px;">${profile.website}</div>` : ''}
        </div>
    </div>
    `;
};

// --- TEMPLATE 3: High End Split Layout (Stunning Design) ---
export const getHighEndHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#2c3e50';
    const accentColor = primaryColor;

    const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const companyWebsite = data.companyWebsite || profile.website || '';

    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    const rowsHtml = lineItems.map((item: any, index: number) => `
        <tr style="background-color: ${index % 2 === 0 ? '#fafafa' : '#ffffff'};">
            <td style="padding: 15px 10px; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">${item.description}</td>
            <td style="padding: 15px 10px; text-align: center; color: #666; border-bottom: 1px solid #f0f0f0;">${item.quantity}</td>
            <td style="padding: 15px 10px; text-align: right; color: #666; border-bottom: 1px solid #f0f0f0;">${formatMoney(item.rate)}</td>
            <td style="padding: 15px 10px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #f0f0f0;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: flex; flex-direction: row; width: 100%; min-height: 1000px; box-sizing: border-box;">
        
        <!-- Left Sidebar (Dark) -->
        <div style="width: 35%; background-color: #1a1a1a; color: #ffffff; padding: 60px 40px; display: flex; flex-direction: column;">
            <!-- Logo Area -->
            <div style="margin-bottom: 80px;">
                ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-width: 100%; max-height: 100px; object-fit: contain; filter: brightness(0) invert(1);" />`
            : `<h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">${companyName}</h1>`
        }
            </div>

            <!-- Company Contact -->
            <div style="margin-bottom: 80px; font-size: 13px; line-height: 2; opacity: 0.9;">
                <div style="text-transform: uppercase; font-size: 10px; font-weight: 700; opacity: 0.5; margin-bottom: 15px; letter-spacing: 2px;">FROM</div>
                <div style="font-weight: 600; color: #fff; font-size: 15px; margin-bottom: 5px;">${companyName}</div>
                ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                ${companyWebsite ? `<div>${companyWebsite}</div>` : ''}
            </div>

            <!-- Bill To -->
            <div style="margin-bottom: auto;">
                <div style="text-transform: uppercase; font-size: 10px; font-weight: 700; opacity: 0.5; margin-bottom: 15px; letter-spacing: 2px;">BILL TO</div>
                <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #fff;">${clientName}</div>
                <div style="font-size: 14px; line-height: 1.6; opacity: 0.8;">${clientAddress}</div>
            </div>

            <!-- Footer / Branding -->
            <div style="font-size: 10px; opacity: 0.3; margin-top: 40px;">
                ${profile.companyName || 'Contractore App'} • Generated Document
            </div>
        </div>

        <!-- Right Main Content (Light) -->
        <div style="flex: 1; padding: 60px 50px; background-color: #ffffff; display: flex; flex-direction: column;">
            
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 60px;">
                <div>
                    <h1 style="margin: 0; font-size: 64px; font-weight: 900; color: ${primaryColor}; letter-spacing: -3px; line-height: 0.9; text-transform: uppercase;">${title}</h1>
                    <div style="font-size: 16px; font-weight: 500; color: #999; margin-top: 15px; letter-spacing: 1px;">#${labels.idValue}</div>
                </div>
                <div style="text-align: right; padding-top: 10px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #999; letter-spacing: 0.5px; margin-bottom: 4px;">${labels.date}</div>
                    <div style="font-size: 18px; font-weight: 600; color: #333;">${labels.dateValue}</div>
                    
                    ${data.dueDate || data.expiryDate ? `
                    <div style="margin-top: 20px;">
                         <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #999; letter-spacing: 0.5px; margin-bottom: 4px;">Due Date</div>
                         <div style="font-size: 18px; font-weight: 600; color: ${primaryColor};">${data.dueDate || data.expiryDate}</div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Line Items Table -->
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 50px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 20px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; border-bottom: 2px solid ${primaryColor};">Description</th>
                        <th style="text-align: center; padding: 20px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; width: 80px; border-bottom: 2px solid ${primaryColor};">Qty</th>
                        <th style="text-align: right; padding: 20px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; width: 120px; border-bottom: 2px solid ${primaryColor};">Price</th>
                        <th style="text-align: right; padding: 20px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; width: 120px; border-bottom: 2px solid ${primaryColor};">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- Totals Area -->
            <div style="display: flex; justify-content: flex-end; margin-bottom: auto;">
                <div style="width: 320px;">
                     <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 15px; color: #666;">
                        <span>Subtotal</span>
                        <span style="font-weight: 600;">${formatMoney(subtotal)}</span>
                    </div>
                    ${tax > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 15px; color: #666;">
                        <span>Tax (${data.taxRate}%)</span>
                        <span style="font-weight: 600;">${formatMoney(tax)}</span>
                    </div>` : ''}
                     <div style="display: flex; justify-content: space-between; padding: 25px 0; font-size: 32px; font-weight: 800; color: ${primaryColor};">
                        <span>Total</span>
                        <span>${formatMoney(total)}</span>
                    </div>
                </div>
            </div>

            <!-- Notes -->
            ${data.notes ? `
            <div style="margin-top: 50px; padding: 30px; background-color: #f8f9fa; border-left: 5px solid ${primaryColor}; border-radius: 6px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #999; letter-spacing: 2px; margin-bottom: 12px;">NOTES</div>
                <div style="font-size: 14px; color: #555; line-height: 1.8;">${data.notes}</div>
            </div>` : ''}

        </div>
    </div>
    `;
};


// --- TEMPLATE 4: Premium Minimalist (Agency Style) ---
export const getPremiumMinimalistHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#1A1A1A'; // Dark as default
    const formattedDate = new Date(data.date).toLocaleDateString();

    const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

    // Safe strings
    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const companyWebsite = data.companyWebsite || profile.website || '';

    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    // Line Items
    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    // Generate Rows
    const rowsHtml = lineItems.map((item: any) => `
        <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 20px 15px; color: #000000; font-weight: 500;">${item.description}</td>
            <td style="padding: 20px 15px; text-align: center; color: #000000;">${item.quantity}</td>
            <td style="padding: 20px 15px; text-align: right; color: #000000;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: #000000;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 100%; color: #000000; line-height: 1.6; background: #fff; padding: 40px;">
        
        <!-- Top Border Accent -->
        <div style="height: 8px; width: 100%; background: ${primaryColor}; margin-bottom: 40px;"></div>

        <!-- Header Section -->
        <div style="margin-bottom: 60px; display: flex; justify-content: space-between; align-items: flex-start;">
             <div style="flex: 1;">
                 ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 60px; object-fit: contain; margin-bottom: 20px;" />`
            : `<h2 style="margin: 0; margin-bottom: 15px; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #000000;">${companyName}</h2>`
        }
                 <div style="font-size: 13px; color: #000000; line-height: 1.6; font-weight: 500;">
                     ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                     ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                     ${companyWebsite ? `<div style="color: ${primaryColor};">${companyWebsite}</div>` : ''}
                 </div>
             </div>
             
             <div style="text-align: right;">
                 <h1 style="margin: 0; font-size: 32px; font-weight: 800; text-transform: uppercase; letter-spacing: -1px; color: ${primaryColor}; margin-bottom: 5px;">${title}</h1>
                 <div style="font-size: 15px; font-weight: 500; color: #000000; margin-bottom: 20px;">${labels.id} #${labels.idValue}</div>
                 
                 <div style="text-align: right;">
                    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6B7280; letter-spacing: 1px;">${labels.date}</div>
                    <div style="font-size: 15px; font-weight: 600; color: #000000;">${labels.dateValue}</div>
                 </div>
             </div>
        </div>

        <!-- Info Grid -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 50px; background: #F9FAFB; padding: 25px; border-radius: 8px;">
            <div style="flex: 1;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${primaryColor}; margin-bottom: 10px;">BILL TO</div>
                <div style="font-size: 18px; font-weight: 700; color: #000000; margin-bottom: 5px;">${clientName}</div>
                <div style="font-size: 14px; color: #000000; line-height: 1.5;">${clientAddress}</div>
            </div>
             ${data.dueDate || data.expiryDate ? `
            <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${primaryColor}; margin-bottom: 10px;">DUE DATE</div>
                <div style="font-size: 16px; font-weight: 600; color: #000000;">${data.dueDate || data.expiryDate}</div>
            </div>
            ` : ''}
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <thead>
                <tr style="background-color: ${primaryColor};">
                    <th style="text-align: left; padding: 18px 15px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #000000; font-weight: 700; border-top-left-radius: 4px;">Item Description</th>
                    <th style="text-align: center; padding: 18px 15px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #000000; font-weight: 700; width: 80px;">Qty</th>
                    <th style="text-align: right; padding: 18px 15px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #000000; font-weight: 700; width: 120px;">Rate</th>
                    <th style="text-align: right; padding: 18px 15px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #000000; font-weight: 700; width: 120px; border-top-right-radius: 4px;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <!-- Footer / Totals -->
        <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <div style="width: 320px;">
                 <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #000000; font-weight: 500;">
                    <span>Subtotal</span>
                    <span>${formatMoney(subtotal)}</span>
                </div>
                 ${tax > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #000000; font-weight: 500;">
                    <span>Tax (${data.taxRate}%)</span>
                    <span>${formatMoney(tax)}</span>
                </div>` : ''}
                 ${data.discount ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #000000; font-weight: 500;">
                    <span>Discount</span>
                    <span>-${formatMoney(data.discount)}</span>
                </div>` : ''}
                
                <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 20px; border-top: 2px solid ${primaryColor}; align-items: center;">
                    <span style="font-size: 16px; font-weight: 800; text-transform: uppercase; color: ${primaryColor};">Total</span>
                    <span style="font-size: 28px; font-weight: 800; color: ${primaryColor};">${formatMoney(total)}</span>
                </div>
            </div>
        </div>

        <!-- Notes -->
        ${data.notes ? `
        <div style="margin-top: 60px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${primaryColor}; margin-bottom: 12px;">Notes</div>
            <div style="font-size: 14px; color: #000000; line-height: 1.8; padding-top: 10px; border-top: 1px solid #E5E7EB;">${data.notes}</div>
        </div>` : ''}
        
    </div>
    `;
};

// --- TEMPLATE 5: Gradient Border Premium (High-End Design) ---
export const getGradientBorderPremiumHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#4F46E5';
    const secondaryColor = data.themeColors?.secondary || '#7C3AED';

    // Helper to format currency
    const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

    // Safe strings
    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const companyWebsite = data.companyWebsite || profile.website || '';

    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    // Line Items
    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    // Generate Rows with alternating backgrounds
    const rowsHtml = lineItems.map((item: any, index: number) => `
        <tr style="background-color: ${index % 2 === 0 ? '#FAFAFA' : '#FFFFFF'};">
            <td style="padding: 18px 15px; color: #111827; font-weight: 500; border-bottom: 1px solid #E5E7EB;">${item.description}</td>
            <td style="padding: 18px 15px; text-align: center; color: #6B7280; border-bottom: 1px solid #E5E7EB;">${item.quantity}</td>
            <td style="padding: 18px 15px; text-align: right; color: #6B7280; border-bottom: 1px solid #E5E7EB;">${formatMoney(item.rate)}</td>
            <td style="padding: 18px 15px; text-align: right; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Outfit', 'Inter', sans-serif; max-width: 100%; background: #ffffff; padding: 0; position: relative; color: #000000;">
        <style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');</style>
        
        <!-- Vibrant Gradient Header -->
        <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); padding: 50px 50px 70px; clip-path: polygon(0 0, 100% 0, 100% 88%, 0 100%);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                
                <!-- Left: Company Info -->
                <div style="flex: 1; color: #ffffff;">
                    <div style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">${companyName}</div>
                    <div style="font-size: 13px; opacity: 0.95; line-height: 1.5;">
                        ${companyAddress}
                        ${companyPhone ? `• ${companyPhone}` : ''}
                    </div>
                    <div style="font-size: 13px; font-weight: 600; margin-top: 4px;">${companyWebsite}</div>
                </div>

                <!-- Right: Logo & Document Title & ID -->
                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                    ${data.logoUrl ?
            `<div style="margin-bottom: 15px;"><img src="${data.logoUrl}" style="height: 60px; object-fit: contain; filter: brightness(0) invert(1);" /></div>` : ''
        }
                    
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">${title}</h1>
                    
                    <div style="background: rgba(255,255,255,0.25); backdrop-filter: blur(4px); padding: 6px 14px; border-radius: 6px; color: #ffffff; border: 1px solid rgba(255,255,255,0.4); display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; font-weight: 700; opacity: 0.9;">${labels.id}</span>
                        <span style="font-size: 14px; font-weight: 700;">#${labels.idValue}</span>
                    </div>
                </div>
            </div>
        </div>

        <div style="max-width: 90%; margin: -50px auto 0; position: relative;">
            
            <!-- Main Content Card -->
            <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #E5E7EB;">
                
                <!-- Info Bar -->
                <div style="display: flex; padding: 35px 40px; border-bottom: 1px solid #E5E7EB;">
                    <div style="flex: 1;">
                        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${primaryColor}; margin-bottom: 10px;">BILL TO</div>
                        <div style="font-size: 18px; font-weight: 700; color: #000000; margin-bottom: 6px;">${clientName}</div>
                        <div style="font-size: 14px; color: #000000;">${clientAddress}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${secondaryColor}; margin-bottom: 10px;">DATES</div>
                        <div style="font-size: 14px; color: #000000; margin-bottom: 4px;">Issued: <strong>${labels.dateValue}</strong></div>
                        ${data.dueDate ? `<div style="font-size: 14px; color: #000000;">Due: <strong>${data.dueDate}</strong></div>` : ''}
                    </div>
                </div>

                <!-- Table Section -->
                <div style="padding: 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #ffffff; border-bottom: 2px solid #000000;">
                                <th style="padding: 16px 20px; text-align: left; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000000;">Description</th>
                                <th style="padding: 16px 20px; text-align: center; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000000; width: 80px;">Qty</th>
                                <th style="padding: 16px 20px; text-align: right; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000000; width: 120px;">Rate</th>
                                <th style="padding: 16px 20px; text-align: right; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000000; width: 120px;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Footer / Totals -->
                <div style="padding: 30px 40px; background: #FAFAFA; border-top: 1px solid #000000;">
                    <div style="display: flex; justify-content: flex-end;">
                        <div style="width: 300px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #000000;">
                                <span style="font-weight: 500;">Subtotal</span>
                                <span style="font-weight: 700;">${formatMoney(subtotal)}</span>
                            </div>
                            
                            ${tax > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #000000;">
                                <span style="font-weight: 500;">Tax (${data.taxRate}%)</span>
                                <span style="font-weight: 700;">${formatMoney(tax)}</span>
                            </div>` : ''}
                            
                            ${data.discount ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #000000;">
                                <span style="font-weight: 500;">Discount</span>
                                <span style="font-weight: 700;">-${formatMoney(data.discount)}</span>
                            </div>` : ''}

                            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid ${primaryColor}; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: ${primaryColor};">Total</span>
                                <span style="font-size: 24px; font-weight: 900; color: #000000;">${formatMoney(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${data.notes ? `
            <div style="margin-top: 30px; padding: 0 10px;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #000000; margin-bottom: 8px;">Notes</div>
                <div style="font-size: 13px; color: #000000; line-height: 1.6;">${data.notes}</div>
            </div>` : ''}

            <!-- Bottom Gradient Footer -->
            <div style="margin-top: 40px; text-align: center;">
                <div style="height: 4px; width: 60px; background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%); margin: 0 auto 15px; border-radius: 4px;"></div>
                <div style="font-size: 12px; color: #000000; opacity: 0.7;">Thank you for your business</div>
            </div>
        </div>
    </div>
    `;
};

// --- TEMPLATE: Profit Report (Internal Analysis) ---
export const getProfitReportHtmlTemplate = (
    data: ProfitReportData,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#10B981'; // Green for profit

    const formatMoney = (amount: number) => {
        const val = Number(amount || 0);
        return val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${val.toFixed(2)}`;
    };

    const companyName = data.companyName || profile.companyName || 'Company Name';

    // Profit Logic
    const marginColor = data.margin >= 30 ? '#10B981' : data.margin >= 15 ? '#F59E0B' : '#EF4444';

    const rowsHtml = data.items.map((item, index) => {
        const profit = item.charge - item.cost;
        const profitColor = profit >= 0 ? '#10B981' : '#EF4444';
        const rowBg = index % 2 === 0 ? '#F9FAFB' : '#FFFFFF';

        return `
        <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 16px; color: #111827; font-weight: 500;">${item.description}</td>
            <td style="padding: 12px 16px; text-align: right; color: #6B7280; font-family: monospace;">${formatMoney(item.cost)}</td>
            <td style="padding: 12px 16px; text-align: right; color: #111827; font-family: monospace;">${formatMoney(item.charge)}</td>
            <td style="padding: 12px 16px; text-align: right; color: ${profitColor}; font-weight: 600; font-family: monospace;">${formatMoney(profit)}</td>
        </tr>`;
    }).join('');

    return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; color: #1F2937; line-height: 1.5; padding: 40px;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #E5E7EB;">
            <div>
                <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #111827;">${title}</h1>
                <div style="color: #6B7280; margin-top: 4px;">${data.date} • ${data.reportNumber}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: 700; font-size: 18px; color: ${primaryColor};">${companyName}</div>
                <div style="font-size: 12px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Internal Financial Report</div>
            </div>
        </div>

        <!-- KPI Cards -->
        <div style="display: flex; gap: 20px; margin-bottom: 40px;">
            <div style="flex: 1; padding: 20px; background: #F3F4F6; border-radius: 12px; text-align: center;">
                <div style="font-size: 12px; text-transform: uppercase; color: #6B7280; font-weight: 600; margin-bottom: 8px;">Revenue</div>
                <div style="font-size: 24px; font-weight: 700; color: #111827;">${formatMoney(data.totalRevenue)}</div>
            </div>
            <div style="flex: 1; padding: 20px; background: #FEF2F2; border-radius: 12px; text-align: center;">
                <div style="font-size: 12px; text-transform: uppercase; color: #EF4444; font-weight: 600; margin-bottom: 8px;">Cost</div>
                <div style="font-size: 24px; font-weight: 700; color: #EF4444;">${formatMoney(data.totalCost)}</div>
            </div>
            <div style="flex: 1; padding: 20px; background: #ECFDF5; border-radius: 12px; text-align: center; border: 1px solid ${marginColor};">
                <div style="font-size: 12px; text-transform: uppercase; color: #059669; font-weight: 600; margin-bottom: 8px;">Net Profit</div>
                <div style="font-size: 24px; font-weight: 700; color: ${marginColor};">${formatMoney(data.grossProfit)}</div>
            </div>
            <div style="flex: 1; padding: 20px; background: #FFFBEB; border-radius: 12px; text-align: center;">
                <div style="font-size: 12px; text-transform: uppercase; color: #D97706; font-weight: 600; margin-bottom: 8px;">Margin</div>
                <div style="font-size: 24px; font-weight: 700; color: #D97706;">${data.margin.toFixed(1)}%</div>
            </div>
        </div>

        <!-- Breakdown Table -->
        <div style="border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; margin-bottom: 40px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #F9FAFB; border-bottom: 2px solid #E5E7EB;">
                        <th style="padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6B7280; font-weight: 600;">Description</th>
                        <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6B7280; font-weight: 600;">Cost</th>
                        <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6B7280; font-weight: 600;">Charge</th>
                        <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6B7280; font-weight: 600;">Profit</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>

        <!-- Summary Footer -->
        <div style="display: flex; justify-content: flex-end;">
            <div style="width: 300px;">
                ${data.vatEnabled ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #6B7280;">
                    <span>Tax / VAT (${data.vatRate}%)</span>
                    <span>${formatMoney(data.taxAmount)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px dashed #E5E7EB; margin-top: 12px;">
                    <span style="font-weight: 600; font-size: 16px;">Total with Tax</span>
                    <span style="font-weight: 700; font-size: 18px; color: #111827;">${formatMoney(data.totalWithTax)}</span>
                </div>
                ` : ''}
            </div>
        </div>

        ${data.notes ? `
        <div style="margin-top: 40px; padding: 20px; background: #F9FAFB; border-radius: 8px; border-left: 4px solid #D1D5DB;">
            <div style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: 600; margin-bottom: 4px;">Notes</div>
            <div style="font-size: 14px; color: #374151;">${data.notes}</div>
        </div>` : ''}

        <div style="margin-top: 60px; border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #9CA3AF; font-size: 11px;">
            Generated by Contractore • ${new Date().toLocaleDateString()}
        </div>
    </div>
    `;
};
