import { InvoiceData, EstimateData, UserProfile, Job, WorkOrderData, PurchaseOrderData } from '../../types';

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

// Templates 8-10: Organic Nature, Geometric Bold, Pastel Soft
// Import these along with newHtmlTemplates.ts functions

export { getNeonCyberpunkHtmlTemplate, getLuxuryGoldNavyHtmlTemplate } from './newHtmlTemplates';
export { getVintageCraftHtmlTemplate, getBlueprintTechHtmlTemplate, getAbstractMemphisHtmlTemplate, getCrimsonNoirHtmlTemplate, getWatercolorArtisticHtmlTemplate } from './secondSetTemplates';
export { getSwissGridHtmlTemplate, getSpaceOdysseyHtmlTemplate, getRetroTerminalHtmlTemplate, getPlayfulPopHtmlTemplate, getElegantSerifHtmlTemplate } from './thirdSetTemplates';

// TEMPLATE 8: ORGANIC NATURE
export const getOrganicNatureHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const earthGreen = '#2D6A4F';
    const warmBrown = '#6C584C';

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
        <tr style="border-bottom: 1px solid #D4E8D4; background: ${index % 2 === 0 ? '#F8FBF8' : '#FFFFFF'};">
            <td style="padding: 10px 12px; color: #333333; font-weight: 500; font-size: 11px;">${item.description}</td>
            <td style="padding: 10px 12px; text-align: center; color: ${earthGreen}; font-weight: 700; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 10px 12px; text-align: right; color: #666666; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${warmBrown}; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Trebuchet MS', sans-serif; background: linear-gradient(135deg, #E8F5E9 0%, #F1F8E9 50%, #FFF8E1 100%); padding: 15px 0; min-height: 700px; position: relative;">
        <div style="position: absolute; top: -50px; right: -50px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(45, 106, 79, 0.08) 0%, transparent 70%); border-radius: 60% 40% 55% 45%;"></div>
        <div style="max-width: 780px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 40px rgba(45, 106, 79, 0.12); position: relative;">
            <svg style="width: 100%; height: 35px; display: block;" viewBox="0 0 1200 60" preserveAspectRatio="none">
                <path d="M0,30 Q300,0 600,30 T1200,30 L1200,60 L0,60 Z" fill="${earthGreen}"/>
            </svg>
            <div style="padding: 20px 30px 25px;">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1;">
                        ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 40px; border-radius: 6px; margin-bottom: 10px;" />` : `<h2 style="margin: 0 0 10px 0; font-size: 18px; color: ${earthGreen};">${companyName}</h2>`}
                        <div style="font-size: 10px; color: #5A6C5A;">
                            ${companyAddress ? `<div>🏡 ${companyAddress}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: ${warmBrown};">${title}</h1>
                        <div style="background:#F5F5F5; padding: 10px 15px; border-radius: 10px; margin-top: 10px;">
                            <div style="font-size: 8px; color: ${earthGreen}; margin-bottom: 2px;">${labels.id}</div>
                            <div style="font-size: 12px; font-weight: 700;">${labels.idValue}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding: 20px 30px;">
                <div style="background: linear-gradient(135deg, ${earthGreen}11 0%, transparent 100%); border-radius: 12px; padding: 15px; margin-bottom: 20px; border-left: 3px solid ${earthGreen};">
                    <div style="font-size: 14px; font-weight: 800; color: ${warmBrown}; margin-bottom: 5px;">${clientName}</div>
                    <div style="font-size: 11px; color: #555555;">${clientAddress}</div>
                </div>
                <table style="width: 100%; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, ${earthGreen} 0%, #52B788 100%);">
                            <th style="text-align: left; padding: 12px; color: #333333; font-size: 10px; font-weight: 700;">Item</th>
                            <th style="text-align: center; padding: 12px; color: #333333; width: 60px; font-size: 10px; font-weight: 700;">Qty</th>
                            <th style="text-align: right; padding: 12px; color: #333333; width: 90px; font-size: 10px; font-weight: 700;">Rate</th>
                            <th style="text-align: right; padding: 12px; color: #333333; width: 100px; font-size: 10px; font-weight: 700;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 220px; background: linear-gradient(135deg, #F8FBF8 0%, #F0F7F0 100%); border-radius: 12px; padding: 18px; border: 1px solid ${earthGreen}33;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px;">
                            <span>Subtotal</span>
                            <span style="font-weight: 700;">${formatMoney(subtotal)}</span>
                        </div>
                        ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px;"><span>Tax (${data.taxRate}%)</span><span style="font-weight: 700;">${formatMoney(tax)}</span></div>` : ''}
                        <div style="border-top: 1px solid ${earthGreen}; margin: 12px 0; padding-top: 12px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="font-size: 10px; font-weight: 800; color: ${earthGreen};">Total</span>
                                <span style="font-size: 22px; font-weight: 900; color: ${warmBrown};">${formatMoney(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <svg style="width: 100%; height: 35px; display: block;" viewBox="0 0 1200 60" preserveAspectRatio="none">
                <path d="M0,0 L0,30 Q300,60 600,30 T1200,30 L1200,0 Z" fill="${earthGreen}"/>
            </svg>
                <div style="background: ${earthGreen}; padding: 15px; text-align: center; color: #FFFFFF;">
                <div style="font-size: 11px; margin-bottom: 4px;">${companyName}</div>
                <div style="color: rgba(255, 255, 255, 0.8); font-size: 9px;">${companyAddress}</div>
            </div>
            ${data.signature ? `
            <div style="position: absolute; bottom: 85px; right: 40px; text-align: center;">
                <img src="${data.signature}" style="max-height: 50px; max-width: 150px; filter: grayscale(100%) sepia(100%) hue-rotate(90deg) brightness(0.9);" />
                <div style="border-top: 1px solid ${warmBrown}; width: 150px; margin-top: 5px;"></div>
                <div style="font-size: 8px; color: ${warmBrown}; margin-top: 3px; font-weight: 700;">AUTHORIZED SIGNATURE</div>
            </div>` : ''}
        </div>
    </div>
    `;
};

// TEMPLATE 9: GEOMETRIC BOLD - Hexagonal Modern Design
export const getGeometricBoldHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    // Use user's theme color if available, otherwise default to electric cyan
    const accentColor = data.themeColors?.primary || '#00D4FF';
    const charcoal = '#2C2C2C';
    const lightGray = '#F4F4F4';

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    const rowsHtml = lineItems.map((item: any, index: number) => `
        <tr style="border-bottom: 1px solid #CCCCCC; background: #E8E8E8;">
            <td style="padding: 12px 15px; color: ${charcoal}; font-size: 11px; font-weight: 500;">${item.description}</td>
            <td style="padding: 12px 10px; text-align: center; color: #666666; font-weight: 700; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 12px 10px; text-align: right; color: #666666; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 12px 15px; text-align: right; font-weight: 700; color: ${charcoal}; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Segoe UI', 'Helvetica Neue', sans-serif; background: ${lightGray}; padding: 20px 0; min-height: 700px; position: relative;">
        
        <!-- Floating Hexagon Decorations -->
        <div style="position: absolute; top: 30px; left: 20px; width: 60px; height: 52px; background: ${accentColor}15; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
        <div style="position: absolute; top: 80px; right: 40px; width: 40px; height: 35px; background: ${accentColor}20; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
        <div style="position: absolute; bottom: 100px; left: 50px; width: 30px; height: 26px; background: ${charcoal}10; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>

        <div style="max-width: 780px; margin: 0 auto; background: #FFFFFF; overflow: hidden; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1); position: relative;">
            
            <!-- Geometric Border Top -->
            <div style="height: 4px; background: linear-gradient(90deg, ${accentColor} 0%, ${accentColor} 30%, ${charcoal} 30%, ${charcoal} 70%, ${accentColor} 70%, ${accentColor} 100%);"></div>
            
            <!-- Header: Split Layout -->
            <div style="display: flex; min-height: 100px;">
                <!-- Left: Dark Section with Company -->
                <div style="flex: 0 0 45%; background: ${charcoal}; padding: 25px; position: relative; clip-path: polygon(0 0, 100% 0, 85% 100%, 0% 100%);">
                    <div style="position: absolute; top: 10px; right: 30px; width: 20px; height: 17px; background: ${accentColor}30; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
                    ${data.logoUrl
            ? `<img src="${data.logoUrl}" style="max-height: 35px; filter: brightness(0) invert(1); margin-bottom: 12px;" />`
            : `<h2 style="margin: 0 0 12px 0; font-size: 16px; color: #FFFFFF; font-weight: 700; letter-spacing: 1px;">${companyName}</h2>`
        }
                    <div style="font-size: 9px; color: rgba(255,255,255,0.7); line-height: 1.6;">
                        ${companyAddress ? `<div>${companyAddress}</div>` : ''}
                        ${companyPhone ? `<div>${companyPhone}</div>` : ''}
                    </div>
                </div>
                <!-- Right: Light Section with Title -->
                <div style="flex: 1; padding: 25px 25px 25px 40px; display: flex; flex-direction: column; justify-content: center;">
                    <h1 style="margin: 0 0 15px 0; font-size: 32px; font-weight: 800; color: ${charcoal}; letter-spacing: -1px;">${title}</h1>
                    <div style="display: flex; gap: 20px;">
                        <div style="background: ${accentColor}15; border-left: 3px solid ${accentColor}; padding: 8px 12px;">
                            <div style="font-size: 8px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">${labels.id}</div>
                            <div style="font-size: 14px; font-weight: 700; color: ${charcoal};">${labels.idValue}</div>
                        </div>
                        <div style="background: ${lightGray}; border-left: 3px solid ${charcoal}; padding: 8px 12px;">
                            <div style="font-size: 8px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">${labels.date}</div>
                            <div style="font-size: 12px; font-weight: 600; color: ${charcoal};">${labels.dateValue}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Section -->
            <div style="padding: 25px;">
                
                <!-- Client Card with Geometric Accent -->
                <div style="display: flex; align-items: stretch; margin-bottom: 25px;">
                    <div style="width: 6px; background: linear-gradient(180deg, ${accentColor} 0%, ${charcoal} 100%);"></div>
                    <div style="flex: 1; background: ${lightGray}; padding: 15px 20px;">
                        <div style="font-size: 8px; color: #888888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Bill To</div>
                        <div style="font-size: 14px; font-weight: 700; color: ${charcoal}; margin-bottom: 3px;">${clientName}</div>
                        <div style="font-size: 10px; color: #666666;">${clientAddress}</div>
                    </div>
                    <!-- Geometric Shape Accent -->
                    <div style="width: 50px; background: ${charcoal}; clip-path: polygon(30% 0, 100% 0, 100% 100%, 0% 100%); display: flex; align-items: center; justify-content: center;">
                        <div style="width: 15px; height: 13px; background: ${accentColor}; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
                    </div>
                </div>

                <!-- Line Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #F0F0F0;">
                    <thead>
                        <tr style="background: #2c2c2c !important;">
                            <th style="text-align: left; padding: 12px 15px; color: #FFFFFF; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; background-color: #2c2c2c;">Description</th>
                            <th style="text-align: center; padding: 12px 10px; color: #FFFFFF; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; width: 60px; background-color: #2c2c2c;">Qty</th>
                            <th style="text-align: right; padding: 12px 10px; color: #FFFFFF; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; width: 80px; background-color: #2c2c2c;">Rate</th>
                            <th style="text-align: right; padding: 12px 15px; color: #FFFFFF; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; width: 90px; background-color: #2c2c2c;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>

                <!-- Totals: Geometric Card -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 240px; position: relative;">
                        <!-- Geometric background accent -->
                        <div style="position: absolute; top: -10px; right: -10px; width: 30px; height: 26px; background: ${accentColor}20; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
                        <div style="background: linear-gradient(135deg, ${charcoal} 0%, #3a3a3a 100%); padding: 20px; position: relative;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 11px; color: rgba(255,255,255,0.6);">
                                <span>Subtotal</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(subtotal)}</span>
                            </div>
                            ${tax > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 11px; color: rgba(255,255,255,0.6);">
                                <span>Tax (${data.taxRate}%)</span>
                                <span style="color: #FFFFFF; font-weight: 600;">${formatMoney(tax)}</span>
                            </div>` : ''}
                            <div style="border-top: 2px solid ${accentColor}; margin: 15px 0; padding-top: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: ${accentColor};">Total</span>
                                    <span style="font-size: 22px; font-weight: 800; color: ${accentColor};">${formatMoney(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                ${data.notes ? `
                <div style="margin-top: 25px; padding: 15px; background: ${lightGray}; border-left: 3px solid ${accentColor};">
                    <div style="font-size: 8px; color: #888888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; font-weight: 600;">Notes</div>
                    <div style="font-size: 10px; color: #555555; line-height: 1.6;">${data.notes}</div>
                </div>` : ''}

                ${data.signature ? `
                <div style="margin-top: 30px; display: flex; justify-content: flex-end;">
                    <div style="text-align: center;">
                        <img src="${data.signature}" style="max-height: 50px; max-width: 180px;" />
                        <div style="height: 2px; width: 180px; background: ${charcoal}; margin-top: 5px; clip-path: polygon(0 0, 100% 0, 95% 100%, 5% 100%);"></div>
                        <div style="font-size: 8px; font-weight: 700; color: ${charcoal}; letter-spacing: 2px; margin-top: 5px; text-transform: uppercase;">Signature</div>
                    </div>
                </div>` : ''}
            </div>

            <!-- Footer: Geometric Pattern -->
            <div style="display: flex; height: 50px;">
                <div style="flex: 0 0 70%; background: ${charcoal}; padding: 15px 25px; display: flex; align-items: center; clip-path: polygon(0 0, 100% 0, 95% 100%, 0% 100%);">
                    <div style="font-size: 10px; color: rgba(255,255,255,0.8);">${companyName} • ${companyAddress}</div>
                </div>
                <div style="flex: 1; background: ${accentColor}; display: flex; align-items: center; justify-content: center;">
                    <div style="width: 20px; height: 17px; background: #FFFFFF; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
                </div>
            </div>
        </div>
    </div>
    `;
};

// TEMPLATE 10: PASTEL SOFT
export const getPastelSoftHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const primaryColor = data.themeColors?.primary || '#A855F7';
    const softPink = '#FFB5D8';
    const softPurple = '#C9ADA7';

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const companyAddress = data.companyAddress || profile.address || '';
    const companyPhone = data.companyPhone || profile.phone || '';
    const clientName = data.clientName || '';
    const clientAddress = data.clientAddress || data.projectAddress || '';

    const lineItems = data.lineItems || [];
    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    const rowsHtml = lineItems.map((item: any, index: number) => `
        <tr style="border-bottom: 1px solid ${primaryColor}44; background: ${index % 2 === 0 ? `${primaryColor}0A` : `${primaryColor}15`};">
            <td style="padding: 10px 12px; color: #666666; font-weight: 500; font-size: 11px;">${item.description}</td>
            <td style="padding: 10px 12px; text-align: center; color: #666666; font-weight: 700; font-size: 11px;">${item.quantity}</td>
            <td style="padding: 10px 12px; text-align: right; color: #666666; font-size: 11px;">${formatMoney(item.rate)}</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #666666; font-size: 11px;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Quicksand', 'Trebuchet MS', sans-serif; background: linear-gradient(135deg, #FFF5F7 0%, #F0F9FF 50%, #FAF5FF 100%); padding: 20px 0; min-height: 700px;">
        <div style="max-width: 780px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); border-radius: 20px; overflow: hidden; box-shadow: 0 15px 40px rgba(200, 150, 200, 0.15);">
            <div style="padding: 25px 35px 20px; background: linear-gradient(135deg, #FFE4F6 0%, #E0F2FE 50%, #F3E8FF 100%);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 60px; max-width: 180px; object-fit: contain; margin-bottom: 12px;" />` : `<h2 style="margin: 0 0 12px 0; font-size: 20px; color: #A855F7;">${companyName}</h2>`}
                        <div style="font-size: 10px; color: #8B7B8B; line-height: 1.5;">
                            ${companyAddress ? `<div>💌 ${companyAddress}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.5; padding-top: 2px; padding-bottom: 2px;">${title}</h1>
                        <div style="background: rgba(255, 255, 255, 0.9); padding: 10px 15px; border-radius: 12px; margin-top: 10px; display: inline-block;">
                            <div style="font-size: 8px; color: #A855F7; margin-bottom: 2px;">${labels.id}</div>
                            <div style="font-size: 13px; font-weight: 700;">${labels.idValue}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding: 20px 35px;">
                <div style="background: linear-gradient(135deg, #FAF5FF 0%, #FFF1F2 100%); border-radius: 15px; padding: 15px 20px; margin-bottom: 20px; border: 1px solid rgba(168, 85, 247, 0.15); display: flex; align-items: center; gap: 15px;">
                    <div>
                        <div style="font-size: 8px; text-transform: uppercase; color: #A855F7; font-weight: 700; margin-bottom: 2px;">Bill To</div>
                        <div style="font-size: 14px; font-weight: 800; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.6; padding-top: 1px; padding-bottom: 1px;">${clientName}</div>
                    </div>
                    <div style="width: 1px; height: 30px; background: rgba(168, 85, 247, 0.2);"></div>
                    <div style="font-size: 11px; color: #666666;">${clientAddress}</div>
                </div>
                
                <div style="background: ${primaryColor}10; border-radius: 12px; padding: 10px; border: 2px solid ${primaryColor}44;">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 4px; margin-bottom: 5px;">
                        <thead>
                            <tr style="background: ${primaryColor}; border-radius: 8px; line-height: 1.4;">
                                <th style="text-align: left; padding: 10px 12px; color: #000000; border-radius: 8px 0 0 8px; font-size: 10px; font-weight: 700; vertical-align: middle;">Item</th>
                                <th style="text-align: center; padding: 10px 12px; color: #000000; width: 70px; font-size: 10px; font-weight: 700; vertical-align: middle;">Qty</th>
                                <th style="text-align: right; padding: 10px 12px; color: #000000; width: 90px; font-size: 10px; font-weight: 700; vertical-align: middle;">Rate</th>
                                <th style="text-align: right; padding: 10px 12px; color: #000000; width: 100px; border-radius: 0 8px 8px 0; font-size: 10px; font-weight: 700; vertical-align: middle;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                    <div style="width: 200px; background: linear-gradient(135deg, #FAF5FF 0%, #FFF1F2 100%); border-radius: 15px; padding: 15px; border: 1px solid rgba(168, 85, 247, 0.2);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 10px; color: #666666;">
                            <span>Subtotal</span>
                            <span style="font-weight: 700;">${formatMoney(subtotal)}</span>
                        </div>
                        ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 10px; color: #666666;"><span>Tax (${data.taxRate}%)</span><span style="font-weight: 700;">${formatMoney(tax)}</span></div>` : ''}
                        <div style="border-top: 1px solid rgba(168, 85, 247, 0.3); margin: 8px 0; padding-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 10px; font-weight: 800; color: #A855F7;">Total</span>
                                <span style="font-size: 18px; font-weight: 900; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.5; padding-top: 1px; padding-bottom: 1px;">${formatMoney(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
                ${data.signature ? `
                <div style="margin-top: 30px; margin-left: 20px; margin-bottom: 20px;">
                    <img src="${data.signature}" style="max-height: 60px; max-width: 200px;" />
                    <div style="width: 200px; height: 1px; background: linear-gradient(90deg, #EC4899, #A855F7); margin-top: 5px;"></div>
                    <div style="font-size: 9px; font-weight: 700; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-top: 5px;">Authorized Signature</div>
                </div>` : ''}
            </div>
            <div style="background: linear-gradient(135deg, #FFE4F6 0%, #E0F2FE 50%, #F3E8FF 100%); padding: 15px; text-align: center;">
                <div style="font-size: 11px; font-weight: 700; background: linear-gradient(135deg, #A855F7 0%, #EC4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px;">${companyName}</div>
                <div style="font-size: 9px; color: #8B7B8B;">${companyAddress}</div>
                <div style="margin-top: 8px; font-size: 8px; color: #A8A8A8;">✨ Made with care ✨</div>
            </div>
        </div>
    </div>
    `;
};
