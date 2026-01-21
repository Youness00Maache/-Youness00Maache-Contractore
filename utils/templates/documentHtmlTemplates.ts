import { InvoiceData, EstimateData, UserProfile, Job, WorkOrderData, PurchaseOrderData } from '../../types';

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
export const getGlassmorphismModernHtmlTemplate = (
    data: InvoiceData | EstimateData | WorkOrderData | PurchaseOrderData | any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#6366F1';
    const secondaryColor = data.themeColors?.secondary || '#8B5CF6';

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
        <tr style="background: ${index % 2 === 0 ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(249, 250, 251, 0.9) 100%)' : 'rgba(255, 255, 255, 0.6)'}; backdrop-filter: blur(10px); transition: all 0.3s ease;">
            <td style="padding: 20px 18px; color: #1F2937; font-weight: 600; border-bottom: 1px solid rgba(209, 213, 219, 0.3);">
                <div style="font-size: 15px;">${item.description}</div>
            </td>
            <td style="padding: 20px 18px; text-align: center; color: #6B7280; border-bottom: 1px solid rgba(209, 213, 219, 0.3); font-weight: 600; font-size: 14px;">${item.quantity}</td>
            <td style="padding: 20px 18px; text-align: right; color: #6B7280; border-bottom: 1px solid rgba(209, 213, 219, 0.3); font-weight: 500; font-size: 14px;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px 18px; text-align: right; font-weight: 700; color: #111827; border-bottom: 1px solid rgba(209, 213, 219, 0.3); font-size: 15px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position: relative; min-height: 1000px; background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%); padding: 0;">
        
        <!-- Animated Background Orbs -->
        <div style="position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%); border-radius: 50%; filter: blur(60px);"></div>
        <div style="position: absolute; bottom: -150px; left: -150px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%); border-radius: 50%; filter: blur(80px);"></div>
        
        <!-- Main Glassmorphic Container -->
        <div style="position: relative; max-width: 900px; margin: 0 auto; padding: 50px 0;">
            <div style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(20px); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.2) inset; overflow: hidden;">
                
                <!-- Gradient Top Edge -->
                <div style="height: 6px; background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%);"></div>
                
                <!-- Header Section with Glassmorphism -->
                <div style="padding: 50px 50px 40px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <!-- Company Info Card -->
                        <div style="flex: 1; max-width: 50%;">
                            <div style="background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(10px); padding: 25px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);">
                                ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 60px; max-width: 180px; object-fit: contain; margin-bottom: 18px; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.1));" />`
            : `<h2 style="margin: 0 0 18px 0; font-size: 26px; font-weight: 800; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${companyName}</h2>`
        }
                                <div style="font-size: 13px; color: #374151; line-height: 1.8; font-weight: 500;">
                                    ${companyAddress ? `<div style="margin-bottom: 3px;">📍 ${companyAddress}</div>` : ''}
                                    ${companyPhone ? `<div style="margin-bottom: 3px;">📞 ${companyPhone}</div>` : ''}
                                    ${companyWebsite ? `<div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 600;">🌐 ${companyWebsite}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Document Title Card -->
                        <div style="text-align: right; max-width: 45%;">
                            <h1 style="margin: 0 0 20px 0; font-size: 52px; font-weight: 900; background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.8) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -2px; text-transform: uppercase; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));">${title}</h1>
                            <div style="background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(10px); padding: 20px 25px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.6); display: inline-block; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);">
                                <div style="margin-bottom: 12px;">
                                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6B7280; letter-spacing: 1.5px; margin-bottom: 5px;">${labels.id}</div>
                                    <div style="font-size: 18px; font-weight: 800; color: #111827;">${labels.idValue}</div>
                                </div>
                                <div>
                                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6B7280; letter-spacing: 1.5px; margin-bottom: 5px;">${labels.date}</div>
                                    <div style="font-size: 15px; font-weight: 600; color: #374151;">${labels.dateValue}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Content Section -->
                <div style="padding: 45px 50px;">
                    
                    <!-- Client Info with Gradient Accent -->
                    <div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%); border-left: 5px solid ${primaryColor}; border-radius: 12px; padding: 28px 32px; margin-bottom: 45px; backdrop-filter: blur(10px); box-shadow: 0 8px 24px rgba(99, 102, 241, 0.1);">
                        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; margin-bottom: 14px;">BILL TO</div>
                        <div style="font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 10px; letter-spacing: -0.5px;">${clientName}</div>
                        <div style="font-size: 15px; color: #4B5563; line-height: 1.7; font-weight: 500;">${clientAddress}</div>
                    </div>

                    <!-- Line Items Table with Glass Effect -->
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 45px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);">
                        <thead>
                            <tr style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);">
                                <th style="text-align: left; padding: 22px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #FFFFFF; font-weight: 800;">Description</th>
                                <th style="text-align: center; padding: 22px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #FFFFFF; font-weight: 800; width: 90px;">Qty</th>
                                <th style="text-align: right; padding: 22px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #FFFFFF; font-weight: 800; width: 130px;">Rate</th>
                                <th style="text-align: right; padding: 22px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #FFFFFF; font-weight: 800; width: 140px;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <!-- Totals Section with Premium Card -->
                    <div style="display: flex; justify-content: flex-end;">
                        <div style="width: 400px;">
                            <div style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(249, 250, 251, 0.8) 100%); backdrop-filter: blur(15px); border-radius: 20px; padding: 35px 40px; border: 2px solid rgba(255, 255, 255, 0.5); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; color: #4B5563;">
                                    <span style="font-weight: 600;">Subtotal</span>
                                    <span style="font-weight: 700; color: #1F2937;">${formatMoney(subtotal)}</span>
                                </div>
                                ${tax > 0 ? `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; color: #4B5563;">
                                    <span style="font-weight: 600;">Tax (${data.taxRate}%)</span>
                                    <span style="font-weight: 700; color: #1F2937;">${formatMoney(tax)}</span>
                                </div>` : ''}
                                ${data.discount ? `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; color: #4B5563;">
                                    <span style="font-weight: 600;">Discount</span>
                                    <span style="font-weight: 700; color: #1F2937;">-${formatMoney(data.discount)}</span>
                                </div>` : ''}
                                
                                <div style="border-top: 3px solid rgba(99, 102, 241, 0.2); margin: 25px 0; padding-top: 25px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Total Amount</span>
                                        <span style="font-size: 38px; font-weight: 900; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -1px;">${formatMoney(total)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Notes Section -->
                    ${data.notes ? `
                    <div style="margin-top: 50px; padding: 30px 35px; background: linear-gradient(135deg, rgba(249, 250, 251, 0.7) 0%, rgba(243, 244, 246, 0.8) 100%); backdrop-filter: blur(10px); border-radius: 16px; border-left: 5px solid ${primaryColor}; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);">
                        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; margin-bottom: 14px;">NOTES & TERMS</div>
                        <div style="font-size: 14px; color: #374151; line-height: 1.9; font-weight: 500;">${data.notes}</div>
                    </div>` : ''}
                </div>

                <!-- Footer with Gradient -->
                <div style="background: linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(55, 65, 81, 0.95) 100%); backdrop-filter: blur(10px); padding: 35px 50px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="margin-bottom: 10px; font-weight: 700; color: #F3F4F6; font-size: 15px; letter-spacing: 0.5px;">${companyName}</div>
                    <div style="color: #D1D5DB; font-size: 13px; opacity: 0.9;">
                        ${companyAddress}${companyPhone ? ' · ' + companyPhone : ''}${companyWebsite ? ' · ' + companyWebsite : ''}
                    </div>
                    <div style="margin-top: 20px; font-size: 11px; color: #9CA3AF; opacity: 0.7;">Premium Document • Generated with Care</div>
                </div>
            </div>
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
    const primaryColor = data.themeColors?.primary || '#111111';

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
        <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 20px 0; color: #111; font-weight: 500;">${item.description}</td>
            <td style="padding: 20px 0; text-align: center; color: #555;">${item.quantity}</td>
            <td style="padding: 20px 0; text-align: right; color: #555;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px 0; text-align: right; font-weight: 600; color: #111;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 100%; color: #333; line-height: 1.6;">
        
        <!-- Header Section -->
        <div style="margin-bottom: 60px; padding-bottom: 40px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: flex-start;">
             <div style="flex: 1;">
                 ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 50px; object-fit: contain; margin-bottom: 25px;" />`
            : `<h2 style="margin: 0; margin-bottom: 25px; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: ${primaryColor};">${companyName}</h2>`
        }
                 <div style="font-size: 13px; color: #555; line-height: 1.8;">
                     ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                     ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                     ${companyWebsite ? `<div>${companyWebsite}</div>` : ''}
                 </div>
             </div>
             
             <div style="text-align: right;">
                 <h1 style="margin: 0; font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; color: #999; margin-bottom: 15px;">${title}</h1>
                 <div style="background-color: #f9f9f9; padding: 15px 25px; border-radius: 4px; display: inline-block; text-align: right;">
                    <div style="margin-bottom: 5px;">
                        <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #777; letter-spacing: 1px; margin-right: 15px;">${labels.id}</span>
                        <span style="font-size: 14px; font-weight: 700; color: #111;">${labels.idValue}</span>
                    </div>
                    <div>
                        <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #777; letter-spacing: 1px; margin-right: 15px;">${labels.date}</span>
                        <span style="font-size: 14px; font-weight: 400; color: #333;">${labels.dateValue}</span>
                    </div>
                 </div>
             </div>
        </div>

        <!-- Info Grid -->
        <div style="display: flex; margin-bottom: 60px;">
            <div style="width: 50%; padding-right: 20px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 15px;">TO</div>
                <div style="font-size: 16px; font-weight: 700; color: #111; margin-bottom: 8px;">${clientName}</div>
                <div style="font-size: 14px; color: #555; line-height: 1.6; max-width: 250px;">
                    ${clientAddress}
                </div>
            </div>
             ${data.dueDate || data.expiryDate ? `
            <div style="width: 50%; padding-left: 20px; border-left: 1px solid #eee;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 15px;">DETAILS</div>
                <div>
                     <span style="font-size: 13px; color: #555;">Due Date:</span>
                     <span style="font-size: 13px; font-weight: 600; color: #111; margin-left: 8px;">${data.dueDate || data.expiryDate}</span>
                </div>
            </div>
            ` : ''}
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <thead>
                <tr>
                    <th style="text-align: left; padding: 15px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; font-weight: 700; border-bottom: 2px solid #111;">Item Description</th>
                    <th style="text-align: center; padding: 15px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; font-weight: 700; border-bottom: 2px solid #111; width: 60px;">Qty</th>
                    <th style="text-align: right; padding: 15px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; font-weight: 700; border-bottom: 2px solid #111; width: 100px;">Rate</th>
                    <th style="text-align: right; padding: 15px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; font-weight: 700; border-bottom: 2px solid #111; width: 100px;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <!-- Footer / Totals -->
        <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <div style="width: 280px; background-color: #fafafa; padding: 30px; border-radius: 4px;">
                 <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; color: #555;">
                    <span>Subtotal</span>
                    <span>${formatMoney(subtotal)}</span>
                </div>
                 ${tax > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; color: #555;">
                    <span>Tax (${data.taxRate}%)</span>
                    <span>${formatMoney(tax)}</span>
                </div>` : ''}
                 ${data.discount ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; color: #555;">
                    <span>Discount</span>
                    <span>-${formatMoney(data.discount)}</span>
                </div>` : ''}
                
                <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; align-items: center;">
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #999;">Total</span>
                    <span style="font-size: 24px; font-weight: 700; color: ${primaryColor};">${formatMoney(total)}</span>
                </div>
            </div>
        </div>

        <!-- Notes -->
        ${data.notes ? `
        <div style="margin-top: 60px; border-top: 1px solid #eee; padding-top: 30px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 15px;">Additional Notes</div>
            <div style="font-size: 13px; color: #555; line-height: 1.8; max-width: 600px;">${data.notes}</div>
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
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 100%; background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%); padding: 50px 0;">
        
        <!-- Main Container with Shadow and Border -->
        <div style="max-width: 850px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12); border: 1px solid #E5E7EB;">
            
            <!-- Gradient Top Bar -->
            <div style="height: 8px; background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%);"></div>
            
            <!-- Header Section -->
            <div style="padding: 50px 50px 40px; background: linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%); border-bottom: 2px solid #E5E7EB; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <!-- Left: Logo & Company Info -->
                    <div style="flex: 1;">
                        ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 60px; object-fit: contain; margin-bottom: 20px;" />`
            : `<h2 style="margin: 0 0 20px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: ${primaryColor};">${companyName}</h2>`
        }
                        <div style="font-size: 13px; color: #6B7280; line-height: 1.7;">
                            ${companyAddress ? `<div style="margin-bottom: 3px;">${companyAddress}</div>` : ''}
                            ${companyPhone ? `<div style="margin-bottom: 3px;">${companyPhone}</div>` : ''}
                            ${companyWebsite ? `<div style="color: ${primaryColor}; font-weight: 500;">${companyWebsite}</div>` : ''}
                        </div>
                    </div>
                    
                    <!-- Right: Document Title & Info -->
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 48px; font-weight: 900; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -2px; line-height: 1;">${title}</h1>
                        <div style="margin-top: 20px; background: linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}15 100%); padding: 15px 20px; border-radius: 8px; display: inline-block;">
                            <div style="margin-bottom: 8px;">
                                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9CA3AF; letter-spacing: 1px;">${labels.id}</span>
                                <div style="font-size: 16px; font-weight: 700; color: #111827; margin-top: 3px;">${labels.idValue}</div>
                            </div>
                            <div>
                                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9CA3AF; letter-spacing: 1px;">${labels.date}</span>
                                <div style="font-size: 14px; font-weight: 500; color: #374151; margin-top: 3px;">${labels.dateValue}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Section -->
            <div style="padding: 40px 50px;">
                
                <!-- Client Info Card -->
                <div style="background: linear-gradient(135deg, ${primaryColor}08 0%, ${secondaryColor}08 100%); border-left: 4px solid ${primaryColor}; border-radius: 8px; padding: 25px 30px; margin-bottom: 40px;">
                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9CA3AF; margin-bottom: 12px;">BILL TO</div>
                    <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 8px;">${clientName}</div>
                    <div style="font-size: 14px; color: #6B7280; line-height: 1.6;">${clientAddress}</div>
                </div>

                <!-- Line Items Table -->
                <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 40px; border-radius: 8px; overflow: hidden; border: 1px solid #E5E7EB;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #1F2937 0%, #374151 100%);">
                            <th style="text-align: left; padding: 18px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #FFFFFF; font-weight: 700;">Description</th>
                            <th style="text-align: center; padding: 18px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #FFFFFF; font-weight: 700; width: 80px;">Qty</th>
                            <th style="text-align: right; padding: 18px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #FFFFFF; font-weight: 700; width: 120px;">Rate</th>
                            <th style="text-align: right; padding: 18px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #FFFFFF; font-weight: 700; width: 120px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <!-- Totals Section -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 350px;">
                        <div style="background: #F9FAFB; border-radius: 12px; padding: 25px 30px; border: 1px solid #E5E7EB;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #6B7280;">
                                <span style="font-weight: 500;">Subtotal</span>
                                <span style="font-weight: 600; color: #374151;">${formatMoney(subtotal)}</span>
                            </div>
                            ${tax > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #6B7280;">
                                <span style="font-weight: 500;">Tax (${data.taxRate}%)</span>
                                <span style="font-weight: 600; color: #374151;">${formatMoney(tax)}</span>
                            </div>` : ''}
                            ${data.discount ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #6B7280;">
                                <span style="font-weight: 500;">Discount</span>
                                <span style="font-weight: 600; color: #374151;">-${formatMoney(data.discount)}</span>
                            </div>` : ''}
                            
                            <div style="border-top: 2px solid #E5E7EB; margin: 18px 0; padding-top: 18px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9CA3AF;">Total Amount</span>
                                    <span style="font-size: 32px; font-weight: 900; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${formatMoney(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Notes Section -->
                ${data.notes ? `
                <div style="margin-top: 50px; padding: 25px 30px; background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%); border-radius: 8px; border-left: 4px solid ${primaryColor};">
                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9CA3AF; margin-bottom: 12px;">NOTES</div>
                    <div style="font-size: 14px; color: #4B5563; line-height: 1.8;">${data.notes}</div>
                </div>` : ''}
            </div>

            <!-- Footer -->
            <div style="background: linear-gradient(135deg, #1F2937 0%, #374151 100%); padding: 30px 50px; text-align: center; color: #9CA3AF; font-size: 12px;">
                <div style="margin-bottom: 8px; font-weight: 600; color: #E5E7EB;">${companyName}</div>
                <div style="opacity: 0.8;">${companyAddress} ${companyPhone ? '· ' + companyPhone : ''}</div>
            </div>
        </div>
    </div>
    `;
};
