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
            <td style="padding: 10px 12px; text-align: center; color: ${primaryColor}; font-weight: 700; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 10px 12px; text-align: right; color: #B0B0B0; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${secondaryColor}; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 50%, #16213E 100%); padding: 30px; position: relative; overflow: hidden; min-height: 100vh; width: 100%; box-sizing: border-box;">
        
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
                    
                    <div style="margin-top: 12px; display: flex; gap: 15px; background: rgba(0, 0, 0, 0.6); padding: 8px 12px; border: 1px solid ${primaryColor}66;">
                        <div>
                            <div style="font-size: 8px; color: #606060; text-transform: uppercase;">${labels.id}</div>
                            <div style="font-size: 12px; color: ${primaryColor}; font-weight: 700;">${labels.idValue}</div>
                        </div>
                        <div style="border-left: 1px solid ${primaryColor}44; padding-left: 15px;">
                            <div style="font-size: 8px; color: #606060; text-transform: uppercase;">${labels.date}</div>
                            <div style="font-size: 12px; color: #FFF;">${labels.dateValue}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Area -->
            <div style="padding: 25px 30px;">
                
                <!-- Client Info (Compact) -->
                <div style="margin-bottom: 30px; display: flex; align-items: center; border-left: 2px solid ${secondaryColor}; padding-left: 15px; background: linear-gradient(90deg, ${secondaryColor}11 0%, transparent 100%); padding-top: 10px; padding-bottom: 10px;">
                    <div style="font-size: 10px; color: ${secondaryColor}; margin-right: 15px; font-weight: 700; letter-spacing: 1px;">CLIENT //</div>
                    <div>
                        <div style="font-size: 16px; font-weight: 700; color: #FFFFFF;">${clientName}</div>
                        <div style="font-size: 11px; color: #AAAAAA;">${clientAddress}</div>
                    </div>
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
            <td style="padding: 20px 15px; color: ${navyColor}; font-weight: 500; font-family: 'Georgia', serif;">${item.description}</td>
            <td style="padding: 20px 15px; text-align: center; color: #4A4A4A; font-weight: 600;">${item.quantity}</td>
            <td style="padding: 20px 15px; text-align: right; color: #4A4A4A;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: ${goldColor};">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Garamond', Georgia, serif; background: linear-gradient(135deg, #F5F1E8 0%, #FFFFFF 100%); padding: 60px 0; min-height: 1000px;">
        
        <!-- Ornamental Border Pattern -->
        <div style="max-width: 850px; margin: 0 auto; background: #FFFFFF; box-shadow: 0 30px 90px rgba(10, 25, 49, 0.3); border: 1px solid #E8E4D9; position: relative;">
            
            <!-- Gold Top Border with Pattern -->
            <div style="height: 12px; background: linear-gradient(90deg, ${goldColor} 0%, #ECC94B 50%, ${goldColor} 100%); position: relative;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 100%; background-image: repeating-linear-gradient(90deg, ${navyColor}22 0px, ${navyColor}22 2px, transparent 2px, transparent 20px);"></div>
            </div>
            
            <!-- Header with Watermark -->
            <div style="padding: 60px 60px 50px; background: linear-gradient(135deg, ${navyColor} 0%, #16213E 100%); position: relative; overflow: hidden;">
                
                <!-- Decorative Corner Elements -->
                <div style="position: absolute; top: 20px; left: 20px; width: 80px; height: 80px; border-top: 3px solid ${goldColor}; border-left: 3px solid ${goldColor}; opacity: 0.3;"></div>
                <div style="position: absolute; bottom: 20px; right: 20px; width: 80px; height: 80px; border-bottom: 3px solid ${goldColor}; border-right: 3px solid ${goldColor}; opacity: 0.3;"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1;">
                    <div style="flex: 1; max-width: 45%;">
                        ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 70px; filter: brightness(0) invert(1); margin-bottom: 25px;" />`
            : `<h2 style="margin: 0 0 25px 0; font-size: 28px; color: ${goldColor}; font-weight: 400; letter-spacing: 3px; text-shadow: 0 2px 10px rgba(212, 175, 55, 0.5);">${companyName}</h2>`
        }
                        <div style="font-size: 13px; color: #C5C5C5; line-height: 2;">
                            ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                            ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                            ${companyWebsite ? `<div style="color: ${goldColor};">${companyWebsite}</div>` : ''}
                        </div>
                    </div>
                    
                    <div style="text-align: right; max-width: 50%;">
                        <h1 style="margin: 0 0 25px 0; font-size: 48px; font-weight: 300; color: ${goldColor}; letter-spacing: 5px; text-transform: uppercase; text-shadow: 0 3px 15px rgba(212, 175, 55, 0.6);">${title}</h1>
                        <div style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid ${goldColor}44; padding: 20px 25px; border-radius: 2px;">
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 9px; color: #A0A0A0; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">${labels.id}</div>
                                <div style="font-size: 18px; font-weight: 600; color: ${goldColor}; letter-spacing: 1px;">${labels.idValue}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; color: #A0A0A0; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">${labels.date}</div>
                                <div style="font-size: 15px; color: #FFFFFF;">${labels.dateValue}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Section -->
            <div style="padding: 50px 60px;">
                
                <!-- Client Info Card -->
                <div style="background: linear-gradient(135deg, #F9F7F0 0%, #FEFDFB 100%); border-left: 4px solid ${goldColor}; padding: 30px 35px; margin-bottom: 45px; box-shadow: 0 5px 20px rgba(0, 0, 0, 0.05);">
                    <div style="font-size: 10px; color: #8B8B8B; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 15px; font-weight: 600;">PREPARED FOR</div>
                    <div style="font-size: 22px; font-weight: 700; color: ${navyColor}; margin-bottom: 10px; font-family: 'Georgia', serif;">${clientName}</div>
                    <div style="font-size: 15px; color: #5A5A5A; line-height: 1.8;">${clientAddress}</div>
                </div>

                <!-- Divider -->
                <div style="height: 2px; background: linear-gradient(90deg, transparent 0%, ${goldColor} 50%, transparent 100%); margin: 40px 0;"></div>

                <!-- Line Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 45px;">
                    <thead>
                        <tr style="background: ${navyColor};">
                            <th style="text-align: left; padding: 20px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: ${goldColor}; font-weight: 700;">Description</th>
                            <th style="text-align: center; padding: 20px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: ${goldColor}; font-weight: 700; width: 90px;">Qty</th>
                            <th style="text-align: right; padding: 20px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: ${goldColor}; font-weight: 700; width: 130px;">Rate</th>
                            <th style="text-align: right; padding: 20px 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: ${goldColor}; font-weight: 700; width: 140px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <!-- Totals Section -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 420px;">
                        <div style="background: linear-gradient(135deg, ${navyColor} 0%, #16213E 100%); padding: 35px 40px; border: 2px solid ${goldColor}; box-shadow: 0 10px 40px rgba(10, 25, 49, 0.4);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; color: #B0B0B0;">
                                <span style="font-weight: 500;">Subtotal</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(subtotal)}</span>
                            </div>
                            ${tax > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; color: #B0B0B0;">
                                <span style="font-weight: 500;">Tax (${data.taxRate}%)</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(tax)}</span>
                            </div>` : ''}
                            
                            <div style="border-top: 2px solid ${goldColor}; margin: 25px 0; padding-top: 25px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: ${goldColor};">Total Amount</span>
                                    <span style="font-size: 40px; font-weight: 700; color: ${goldColor}; text-shadow: 0 3px 15px rgba(212, 175, 55, 0.5); font-family: 'Georgia', serif;">${formatMoney(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                ${data.notes ? `
                <div style="margin-top: 55px; padding: 30px 35px; background: #F9F7F0; border-left: 4px solid ${goldColor}; border-radius: 2px;">
                    <div style="font-size: 10px; color: #8B8B8B; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 15px; font-weight: 600;">ADDITIONAL NOTES</div>
                    <div style="font-size: 14px; color: #4A4A4A; line-height: 1.9; font-family: 'Georgia', serif;">${data.notes}</div>
                </div>` : ''}
            </div>

            <!-- Footer -->
            <div style="background: ${navyColor}; padding: 35px 60px; text-align: center; border-top: 2px solid ${goldColor};">
                <div style="font-size: 14px; color: ${goldColor}; margin-bottom: 10px; letter-spacing: 2px; font-weight: 600;">${companyName}</div>
                <div style="font-size: 12px; color: #A0A0A0;">${companyAddress}${companyPhone ? ' • ' + companyPhone : ''}${companyWebsite ? ' • ' + companyWebsite : ''}</div>
                <div style="margin-top: 20px; font-size: 10px; color: #606060; font-style: italic;">Premium Business Services</div>
            </div>
        </div>
    </div>
    `;
};
