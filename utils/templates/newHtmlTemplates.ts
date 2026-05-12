import { InvoiceData, EstimateData, UserProfile, Job, WorkOrderData, PurchaseOrderData } from '../../types';

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

// =====================================================
// TEMPLATE 6: NEON CYBERPUNK - Dark futuristic with neon accents
// =====================================================
export const getNeonCyberpunkHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#00F0FF';
    const secondaryColor = data.themeColors?.secondary || '#FF006E';

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
        <tr style="border-bottom: 1px solid rgba(0, 240, 255, 0.2); background: ${index % 2 === 0 ? 'rgba(0, 240, 255, 0.03)' : 'transparent'};">
            <td style="padding: 10px 12px; color: #E0E0E0; font-weight: 500; font-size: 11px;">${item.description}</td>
            <td style="padding: 10px 12px; text-align: center; color: #E0E0E0; font-weight: 700; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 10px 12px; text-align: right; color: #B0B0B0; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #E0E0E0; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 50%, #16213E 100%); padding: 30px; position: relative; overflow: hidden; min-height: 297mm; width: 100%; box-sizing: border-box;">
        
        <!-- Neon Grid Background -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: linear-gradient(${primaryColor}22 1px, transparent 1px), linear-gradient(90deg, ${primaryColor}22 1px, transparent 1px); background-size: 40px 40px; opacity: 0.2;"></div>
        
        <!-- Main Container -->
        <div style="position: relative; max-width: 100%; border: 1px solid ${primaryColor}; background: rgba(13, 13, 13, 0.9); box-shadow: 0 0 20px ${primaryColor}44;">
            
            <!-- Top Bar -->
            <div style="height: 3px; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); box-shadow: 0 0 8px ${primaryColor};"></div>
            
            <!-- Header -->
            <div style="padding: 25px 30px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid ${primaryColor}44;">
                
                <!-- Left: Company Info -->
                <div style="flex: 1;">
                    <h2 style="margin: 0 0 10px 0; font-size: 20px; color: ${primaryColor}; text-shadow: 0 0 8px ${primaryColor}; letter-spacing: 2px; text-transform: uppercase;">${companyName}</h2>
                    <div style="font-size: 10px; color: #A0A0A0; line-height: 1.6;">
                        ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                        ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                        ${companyWebsite ? `<div>${companyWebsite}</div>` : ''}
                    </div>
                </div>

                <!-- Right: Logo & Title & Details -->
                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                    ${data.logoUrl ? `<img src="${data.logoUrl}" style="height: 40px; margin-bottom: 10px; filter: drop-shadow(0 0 5px ${primaryColor});" />` : ''}
                    <h1 style="margin: 0; font-size: 32px; font-weight: 900; color: ${secondaryColor}; letter-spacing: 3px; text-shadow: 0 0 15px ${secondaryColor}; line-height: 1;">${title}</h1>
                    
                    <div style="margin-top: 5px; display: flex; gap: 20px; align-items: center;">
                        <div style="text-align: right;">
                            <div style="font-size: 8px; color: #606060; text-transform: uppercase; letter-spacing: 1px;">${labels.id}</div>
                            <div style="font-size: 12px; color: ${primaryColor}; font-weight: 700;">${labels.idValue}</div>
                        </div>
                        <div style="width: 1px; height: 20px; background: ${primaryColor}44;"></div>
                        <div style="text-align: right;">
                            <div style="font-size: 8px; color: #606060; text-transform: uppercase; letter-spacing: 1px;">${labels.date}</div>
                            <div style="font-size: 12px; color: #E0E0E0;">${labels.dateValue}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Area -->
            <div style="padding: 25px 30px;">
                
                <!-- Client Info (Clean Alignment) -->
                <div style="margin-bottom: 30px;">
                    <div style="font-size: 9px; color: ${secondaryColor}; font-weight: 700; letter-spacing: 1px; margin-bottom: 5px; text-transform: uppercase;">BILL TO //</div>
                    <div style="font-size: 16px; font-weight: 700; color: #FFFFFF; margin-bottom: 3px;">${clientName}</div>
                    <div style="font-size: 11px; color: #AAAAAA;">${clientAddress}</div>
                </div>

                <!-- Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <thead>
                        <tr style="border-bottom: 1px solid ${primaryColor};">
                            <th style="text-align: left; padding: 10px 12px; font-size: 9px; color: ${primaryColor}; letter-spacing: 1px;">DESCRIPTION</th>
                            <th style="text-align: center; padding: 10px 12px; font-size: 9px; color: ${primaryColor}; letter-spacing: 1px; width: 60px;">QTY</th>
                            <th style="text-align: right; padding: 10px 12px; font-size: 9px; color: ${primaryColor}; letter-spacing: 1px; width: 100px;">RATE</th>
                            <th style="text-align: right; padding: 10px 12px; font-size: 9px; color: ${primaryColor}; letter-spacing: 1px; width: 100px;">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <!-- Totals (Compact) -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 250px; background: rgba(0,0,0,0.4); border: 1px solid ${primaryColor}44; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888;">
                            <span>Subtotal</span>
                            <span style="color: #EEE;">${formatMoney(subtotal)}</span>
                        </div>
                        ${tax > 0 ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888;">
                            <span>Tax (${data.taxRate}%)</span>
                            <span style="color: #EEE;">${formatMoney(tax)}</span>
                        </div>` : ''}
                        ${data.discount ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888;">
                            <span>Discount</span>
                            <span style="color: #EEE;">-${formatMoney(data.discount)}</span>
                        </div>` : ''}
                        
                        <div style="border-top: 1px solid ${primaryColor}66; margin-top: 10px; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 12px; font-weight: 700; color: ${primaryColor};">TOTAL</span>
                            <span style="font-size: 20px; font-weight: 700; color: ${secondaryColor}; text-shadow: 0 0 10px ${secondaryColor}66;">${formatMoney(total)}</span>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                ${data.notes ? `
                <div style="margin-top: 30px; font-size: 10px; color: #666; border-top: 1px solid #333; padding-top: 10px;">
                    <div style="color: ${primaryColor}; margin-bottom: 5px;">NOTES:</div>
                    ${data.notes}
                </div>` : ''}

                ${data.signature ? `
                <div style="margin-top: 30px;">
                    <div style="font-size: 9px; color: ${primaryColor}; font-weight: 700; letter-spacing: 1px; margin-bottom: 10px; text-transform: uppercase;">AUTHORIZED SIGNATURE</div>
                    <img src="${data.signature}" style="max-height: 60px; max-width: 200px; filter: drop-shadow(0 0 5px ${primaryColor});" />
                    <div style="height: 1px; width: 200px; background: ${primaryColor}; margin-top: 5px; box-shadow: 0 0 5px ${primaryColor};"></div>
                </div>` : ''}
                
                <!-- Footer -->
                <div style="margin-top: 40px; text-align: center; font-size: 9px; color: #444; letter-spacing: 2px;">
                    SECURE TRANSMISSION // END OF LINE
                </div>
            </div>
        </div>
    </div>
    `;
};

// =====================================================
// TEMPLATE 7: LUXURY GOLD & NAVY - Premium business elegance
// =====================================================
export const getLuxuryGoldNavyHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const goldColor = '#D4AF37';
    const navyColor = '#0A1931';

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

    const rowsHtml = lineItems.map((item: any) => `
        <tr style="border-bottom: 1px solid #E8E4D9;">
            <td style="padding: 8px 10px; color: ${navyColor}; font-weight: 500; font-family: 'Georgia', serif; font-size: 11px;">${item.description}</td>
            <td style="padding: 8px 10px; text-align: center; color: #4A4A4A; font-weight: 600; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 8px 10px; text-align: right; color: #4A4A4A; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${goldColor}; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Garamond', Georgia, serif; background: linear-gradient(135deg, #F5F1E8 0%, #FFFFFF 100%); padding: 15px 0; min-height: 700px;">
        
        <!-- Ornamental Border Pattern -->
        <div style="max-width: 800px; margin: 0 auto; background: #FFFFFF; box-shadow: 0 15px 40px rgba(10, 25, 49, 0.2); border: 1px solid #E8E4D9; position: relative;">
            
            <!-- Gold Top Border with Pattern -->
            <div style="height: 6px; background: linear-gradient(90deg, ${goldColor} 0%, #ECC94B 50%, ${goldColor} 100%); position: relative;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 100%; background-image: repeating-linear-gradient(90deg, ${navyColor}22 0px, ${navyColor}22 2px, transparent 2px, transparent 20px);"></div>
            </div>
            
            <!-- Header with Watermark -->
            <div style="padding: 20px 25px 15px; background: linear-gradient(135deg, ${navyColor} 0%, #16213E 100%); position: relative; overflow: hidden;">
                
                <!-- Decorative Corner Elements -->
                <div style="position: absolute; top: 8px; left: 8px; width: 30px; height: 30px; border-top: 2px solid ${goldColor}; border-left: 2px solid ${goldColor}; opacity: 0.3;"></div>
                <div style="position: absolute; bottom: 8px; right: 8px; width: 30px; height: 30px; border-bottom: 2px solid ${goldColor}; border-right: 2px solid ${goldColor}; opacity: 0.3;"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1;">
                    <div style="flex: 1; max-width: 50%;">
                        ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 40px; filter: brightness(0) invert(1); margin-bottom: 10px;" />`
            : `<h2 style="margin: 0 0 10px 0; font-size: 16px; color: ${goldColor}; font-weight: 400; letter-spacing: 2px;">${companyName}</h2>`
        }
                        <div style="font-size: 10px; color: #C5C5C5; line-height: 1.5;">
                            ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                            ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                            ${companyWebsite ? `<div style="color: ${goldColor};">${companyWebsite}</div>` : ''}
                        </div>
                    </div>
                    
                    <div style="text-align: right; max-width: 45%;">
                        <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 300; color: ${goldColor}; letter-spacing: 3px; text-transform: uppercase;">${title}</h1>
                        <div style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid ${goldColor}44; padding: 10px 15px; border-radius: 2px;">
                            <div style="margin-bottom: 6px;">
                                <div style="font-size: 8px; color: #A0A0A0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">${labels.id}</div>
                                <div style="font-size: 12px; font-weight: 600; color: ${goldColor}; letter-spacing: 1px;">${labels.idValue}</div>
                            </div>
                            <div>
                                <div style="font-size: 8px; color: #A0A0A0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">${labels.date}</div>
                                <div style="font-size: 11px; color: #FFFFFF;">${labels.dateValue}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Section -->
            <div style="padding: 20px 25px;">
                
                <!-- Client Info Card -->
                <div style="background: linear-gradient(135deg, #F9F7F0 0%, #FEFDFB 100%); border-left: 3px solid ${goldColor}; padding: 12px 15px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);">
                    <div style="font-size: 8px; color: #8B8B8B; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; font-weight: 600;">PREPARED FOR</div>
                    <div style="font-size: 14px; font-weight: 700; color: ${navyColor}; margin-bottom: 4px; font-family: 'Georgia', serif;">${clientName}</div>
                    <div style="font-size: 11px; color: #5A5A5A; line-height: 1.4;">${clientAddress}</div>
                </div>

                <!-- Divider -->
                <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, ${goldColor} 50%, transparent 100%); margin: 15px 0;"></div>

                <!-- Line Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: ${navyColor};">
                            <th style="text-align: left; padding: 10px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: ${goldColor}; font-weight: 700;">Description</th>
                            <th style="text-align: center; padding: 10px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: ${goldColor}; font-weight: 700; width: 60px;">Qty</th>
                            <th style="text-align: right; padding: 10px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: ${goldColor}; font-weight: 700; width: 90px;">Rate</th>
                            <th style="text-align: right; padding: 10px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: ${goldColor}; font-weight: 700; width: 100px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <!-- Totals Section -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 200px;">
                        <div style="background: linear-gradient(135deg, ${navyColor} 0%, #16213E 100%); padding: 15px 20px; border: 1px solid ${goldColor}; box-shadow: 0 5px 15px rgba(10, 25, 49, 0.3);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #B0B0B0;">
                                <span style="font-weight: 500;">Subtotal</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(subtotal)}</span>
                            </div>
                            ${tax > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #B0B0B0;">
                                <span style="font-weight: 500;">Tax (${data.taxRate}%)</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(tax)}</span>
                            </div>` : ''}
                            
                            <div style="border-top: 1px solid ${goldColor}; margin: 12px 0; padding-top: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${goldColor};">Total</span>
                                    <span style="font-size: 18px; font-weight: 700; color: ${goldColor}; font-family: 'Georgia', serif;">${formatMoney(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                ${data.notes ? `
                <div style="margin-top: 20px; padding: 12px 15px; background: #F9F7F0; border-left: 2px solid ${goldColor}; border-radius: 2px;">
                    <div style="font-size: 8px; color: #8B8B8B; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; font-weight: 600;">ADDITIONAL NOTES</div>
                    <div style="font-size: 10px; color: #4A4A4A; line-height: 1.5; font-family: 'Georgia', serif;">${data.notes}</div>
                </div>` : ''}

                ${data.signature ? `
                <div style="margin-top: 40px; margin-left: 15px;">
                    <img src="${data.signature}" style="max-height: 60px; max-width: 200px;" />
                    <div style="height: 1px; width: 200px; background: ${goldColor}; margin-top: 5px;"></div>
                    <div style="font-size: 8px; color: ${goldColor}; text-transform: uppercase; letter-spacing: 2px; margin-top: 5px; font-weight: 600;">Authorized Signature</div>
                </div>` : ''}
            </div>

            <!-- Footer -->
            <div style="background: ${navyColor}; padding: 15px 25px; text-align: center; border-top: 1px solid ${goldColor};">
                <div style="font-size: 11px; color: ${goldColor}; margin-bottom: 5px; letter-spacing: 1px; font-weight: 600;">${companyName}</div>
                <div style="font-size: 9px; color: #A0A0A0;">${companyAddress}${companyPhone ? ' • ' + companyPhone : ''}${companyWebsite ? ' • ' + companyWebsite : ''}</div>
                <div style="margin-top: 8px; font-size: 8px; color: #606060; font-style: italic;">Premium Business Services</div>
            </div>
        </div>
    </div>
    `;
};
