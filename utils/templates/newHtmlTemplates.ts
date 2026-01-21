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
        <tr style="border-bottom: 1px solid rgba(0, 240, 255, 0.2); background: ${index % 2 === 0 ? 'rgba(0, 240, 255, 0.03)' : 'transparent'}; transition: all 0.3s ease;">
            <td style="padding: 18px 15px; color: #E0E0E0; font-weight: 500;">${item.description}</td>
            <td style="padding: 18px 15px; text-align: center; color: ${primaryColor}; font-weight: 700;">${item.quantity}</td>
            <td style="padding: 18px 15px; text-align: right; color: #B0B0B0;">${formatMoney(item.rate)}</td>
            <td style="padding: 18px 15px; text-align: right; font-weight: 700; color: ${secondaryColor};">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 50%, #16213E 100%); min-height: 1000px; padding: 0; position: relative; overflow: hidden;">
        
        <!-- Neon Grid Background -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: linear-gradient(${primaryColor}22 1px, transparent 1px), linear-gradient(90deg, ${primaryColor}22 1px, transparent 1px); background-size: 50px 50px; opacity: 0.3;"></div>
        
        <!-- Scan Line Effect -->
        <div style="position: absolute; top; 0; left: 0; right: 0; height: 100%; background: linear-gradient(180deg, transparent 0%, ${primaryColor}11 50%, transparent 100%); pointer-events: none;"></div>
        
        <!-- Main Container -->
        <div style="position: relative; max-width: 900px; margin: 0 auto; padding: 50px 0;">
            <div style="background: rgba(13, 13, 13, 0.85); border: 2px solid ${primaryColor}; box-shadow: 0 0 30px ${primaryColor}66, inset 0 0 50px rgba(0, 240, 255, 0.05); border-radius: 4px; overflow: hidden;">
                
                <!-- Glitch Top Bar -->
                <div style="height: 4px; background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 100%); box-shadow: 0 0 10px ${primaryColor};"></div>
                
                <!-- Header -->
                <div style="padding: 40px 50px; background: linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%); border-bottom: 1px solid ${primaryColor}55;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 50px; filter: drop-shadow(0 0 10px ${primaryColor}); margin-bottom: 20px;" />`
            : `<h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 4px; text-shadow: 0 0 10px ${primaryColor};">${companyName}</h2>`
        }
                            <div style="font-size: 12px; color: #808080; font-family: 'Courier New', monospace; line-height: 1.8;">
                                ${companyAddress ? `<div style="color: #A0A0A0;">▸ ${companyAddress}</div>` : ''}
                                ${companyPhone ? `<div style="color: #A0A0A0;">▸ ${companyPhone}</div>` : ''}
                                ${companyWebsite ? `<div style="color: ${primaryColor};">▸ ${companyWebsite}</div>` : ''}
                            </div>
                        </div>
                        
                        <div style="text-align: right;">
                            <h1 style="margin: 0; font-size: 42px; font-weight: 900; color: ${secondaryColor}; text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 0 20px ${secondaryColor}, 0 0 40px ${secondaryColor}88; line-height: 1;">${title}</h1>
                            <div style="margin-top: 20px; background: rgba(0, 0, 0, 0.5); border: 1px solid ${primaryColor}; padding: 15px 20px; display: inline-block;">
                                <div style="margin-bottom: 10px;">
                                    <span style="color: #606060; font-size: 9px; text-transform: uppercase; letter-spacing: 2px;">${labels.id}</span>
                                    <div style="color: ${primaryColor}; font-size: 16px; font-weight: 700; margin-top: 3px; text-shadow: 0 0 5px ${primaryColor};">${labels.idValue}</div>
                                </div>
                                <div>
                                    <span style="color: #606060; font-size: 9px; text-transform: uppercase; letter-spacing: 2px;">${labels.date}</span>
                                    <div style="color: #FFFFFF; font-size: 14px; margin-top: 3px;">${labels.dateValue}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div style="padding: 40px 50px;">
                    
                    <!-- Client Info -->
                    <div style="background: linear-gradient(135deg, rgba(255, 0, 110, 0.1) 0%, rgba(0, 240, 255, 0.05) 100%); border-left: 3px solid ${secondaryColor}; padding: 25px 30px; margin-bottom: 40px; box-shadow: 0 0 20px rgba(255, 0, 110, 0.2);">
                        <div style="font-size: 10px; color: #606060; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px;">► TO</div>
                        <div style="font-size: 20px; font-weight: 700; color: ${secondaryColor}; margin-bottom: 8px; text-shadow: 0 0 10px ${secondaryColor}66;">${clientName}</div>
                        <div style="font-size: 14px; color: #B0B0B0; line-height: 1.7;">${clientAddress}</div>
                    </div>

                    <!-- Line Items Table -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, rgba(0, 240, 255, 0.2) 0%, rgba(255, 0, 110, 0.2) 100%); border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor};">
                                <th style="text-align: left; padding: 18px 15px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; font-weight: 700; text-shadow: 0 0 5px ${primaryColor};">ITEM</th>
                                <th style="text-align: center; padding: 18px 15px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; font-weight: 700; width: 80px; text-shadow: 0 0 5px ${primaryColor};">QTY</th>
                                <th style="text-align: right; padding: 18px 15px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; font-weight: 700; width: 120px; text-shadow: 0 0 5px ${primaryColor};">RATE</th>
                                <th style="text-align: right; padding: 18px 15px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: ${primaryColor}; font-weight: 700; width: 130px; text-shadow: 0 0 5px ${primaryColor};">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <!-- Totals -->
                    <div style="display: flex; justify-content: flex-end;">
                        <div style="width: 400px;">
                            <div style="background: rgba(0, 0, 0, 0.6); border: 1px solid ${primaryColor}; padding: 30px; box-shadow: 0 0 30px ${primaryColor}33;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; color: #A0A0A0;">
                                    <span>Subtotal</span>
                                    <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(subtotal)}</span>
                                </div>
                                ${tax > 0 ? `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; color: #A0A0A0;">
                                    <span>Tax (${data.taxRate}%)</span>
                                    <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(tax)}</span>
                                </div>` : ''}
                                
                                <div style="border-top: 2px solid ${primaryColor}; margin: 20px 0; padding-top: 20px; box-shadow: 0 -2px 10px ${primaryColor}33;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: ${primaryColor}; text-shadow: 0 0 5px ${primaryColor};">TOTAL</span>
                                        <span style="font-size: 36px; font-weight: 900; color: ${secondaryColor}; text-shadow: 0 0 20px ${secondaryColor}, 0 0 40px ${secondaryColor}66;">${formatMoney(total)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Notes -->
                    ${data.notes ? `
                    <div style="margin-top: 50px; padding: 25px 30px; background: rgba(0, 240, 255, 0.05); border-left: 3px solid ${primaryColor}; border-top: 1px solid ${primaryColor}33;">
                        <div style="font-size: 10px; color: #606060; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px;">► NOTES</div>
                        <div style="font-size: 13px; color: #B0B0B0; line-height: 1.8; font-family: 'Courier New', monospace;">${data.notes}</div>
                    </div>` : ''}
                </div>

                <!-- Footer -->
                <div style="background: rgba(0, 0, 0, 0.8); border-top: 1px solid ${primaryColor}55; padding: 25px 50px; text-align: center;">
                    <div style="color: ${primaryColor}; font-size: 12px; margin-bottom: 8px; text-shadow: 0 0 5px ${primaryColor};">${companyName}</div>
                    <div style="color: #606060; font-size: 11px; font-family: 'Courier New', monospace;">${companyAddress} ${companyPhone ? '• ' + companyPhone : ''}</div>
                    <div style="margin-top: 15px; color: #404040; font-size: 9px;">CYBERDOC v2.0 • SECURE TRANSACTION</div>
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
