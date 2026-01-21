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
            <td style="padding: 18px 20px; color: #333333; font-weight: 500;">${item.description}</td>
            <td style="padding: 18px 20px; text-align: center; color: ${earthGreen}; font-weight: 700;">${item.quantity}</td>
            <td style="padding: 18px 20px; text-align: right; color: #666666;">${formatMoney(item.rate)}</td>
            <td style="padding: 18px 20px; text-align: right; font-weight: 700; color: ${warmBrown};">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Trebuchet MS', sans-serif; background: linear-gradient(135deg, #E8F5E9 0%, #F1F8E9 50%, #FFF8E1 100%); padding: 50px 0; min-height: 1000px; position: relative;">
        <div style="position: absolute; top: -100px; right: -100px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(45, 106, 79, 0.08) 0%, transparent 70%); border-radius: 60% 40% 55% 45%;"></div>
        <div style="max-width: 850px; margin: 0 auto; background: #FFFFFF; border-radius: 30px; overflow: hidden; box-shadow: 0 25px 70px rgba(45, 106, 79, 0.15); position: relative;">
            <svg style="width: 100%; height: 60px; display: block;" viewBox="0 0 1200 60" preserveAspectRatio="none">
                <path d="M0,30 Q300,0 600,30 T1200,30 L1200,60 L0,60 Z" fill="${earthGreen}"/>
            </svg>
            <div style="padding: 40px 55px 45px;">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1;">
                        ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 55px; border-radius: 8px; margin-bottom: 20px;" />` : `<h2 style="margin: 0 0 20px 0; font-size: 26px; color: ${earthGreen};">${companyName}</h2>`}
                        <div style="font-size: 13px; color: #5A6C5A;">
                            ${companyAddress ? `<div>🏡 ${companyAddress}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 44px; font-weight: 800; color: ${warmBrown};">${title}</h1>
                        <div style="background:#F5F5F5; padding: 18px 24px; border-radius: 16px; margin-top: 20px;">
                            <div style="font-size: 10px; color: ${earthGreen}; margin-bottom: 4px;">${labels.id}</div>
                            <div style="font-size: 16px; font-weight: 700;">${labels.idValue}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding: 45px 55px;">
                <div style="background: linear-gradient(135deg, ${earthGreen}11 0%, transparent 100%); border-radius: 20px; padding: 28px; margin-bottom: 40px; border-left: 5px solid ${earthGreen};">
                    <div style="font-size: 21px; font-weight: 800; color: ${warmBrown}; margin-bottom: 10px;">${clientName}</div>
                    <div style="font-size: 15px; color: #555555;">${clientAddress}</div>
                </div>
                <table style="width: 100%; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, ${earthGreen} 0%, #52B788 100%);">
                            <th style="text-align: left; padding: 20px; color: #FFFFFF;">Item</th>
                            <th style="text-align: center; padding: 20px; color: #FFFFFF; width: 85px;">Qty</th>
                            <th style="text-align: right; padding: 20px; color: #FFFFFF; width: 125px;">Rate</th>
                            <th style="text-align: right; padding: 20px; color: #FFFFFF; width: 135px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 400px; background: linear-gradient(135deg, #F8FBF8 0%, #F0F7F0 100%); border-radius: 20px; padding: 32px; border: 2px solid ${earthGreen}33;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 14px;">
                            <span>Subtotal</span>
                            <span style="font-weight: 700;">${formatMoney(subtotal)}</span>
                        </div>
                        ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 14px;"><span>Tax (${data.taxRate}%)</span><span style="font-weight: 700;">${formatMoney(tax)}</span></div>` : ''}
                        <div style="border-top: 2px solid ${earthGreen}; margin: 22px 0; padding-top: 22px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="font-size: 13px; font-weight: 800; color: ${earthGreen};">Total</span>
                                <span style="font-size: 38px; font-weight: 900; color: ${warmBrown};">${formatMoney(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <svg style="width: 100%; height: 60px; display: block;" viewBox="0 0 1200 60" preserveAspectRatio="none">
                <path d="M0,0 L0,30 Q300,60 600,30 T1200,30 L1200,0 Z" fill="${earthGreen}"/>
            </svg>
            <div style="background: ${earthGreen}; padding: 30px; text-align: center; color: #FFFFFF;">
                <div style="font-size: 14px; margin-bottom: 8px;">${companyName}</div>
                <div style="color: rgba(255, 255, 255, 0.8); font-size: 12px;">${companyAddress}</div>
            </div>
        </div>
    </div>
    `;
};

// TEMPLATE 9: GEOMETRIC BOLD
export const getGeometricBoldHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const boldRed = '#E63946';
    const deepBlack = '#1D3557';

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
        <tr style="border-bottom: 2px solid #F1F1F1; background: ${index % 2 === 0 ? '#FAFAFA' : '#FFFFFF'};">
            <td style="padding: 18px 20px; color: ${deepBlack}; font-weight: 600;">${item.description}</td>
            <td style="padding: 18px 20px; text-align: center; color: ${boldRed}; font-weight: 800;">${item.quantity}</td>
            <td style="padding: 18px 20px; text-align: right; color: #555555;">${formatMoney(item.rate)}</td>
            <td style="padding: 18px 20px; text-align: right; font-weight: 800; color: ${deepBlack};">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Arial Black', 'Arial', sans-serif; background: #FFFFFF; padding: 0; min-height: 1000px;">
        <div style="width: 100%; height: 8px; background: linear-gradient(90deg, ${boldRed} 0%, ${deepBlack} 100%);"></div>
        <div style="max-width: 850px; margin: 60px auto; background: #FFFFFF; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.15);">
            <div style="background: ${deepBlack}; padding: 50px 55px 80px; clip-path: polygon(0 0, 100% 0, 100% 85%, 0% 100%);">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1;">
                        ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 50px; filter: brightness(0) invert(1);" />` : `<h2 style="margin: 0; font-size: 24px; color: #FFFFFF; text-transform: uppercase;">${companyName}</h2>`}
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 52px; font-weight: 900; color: ${boldRed}; text-transform: uppercase; transform: skewX(-5deg);">${title}</h1>
                        <div style="background: rgba(230, 57, 70, 0.15); border: 2px solid ${boldRed}; padding: 18px; margin-top: 20px; display: inline-block;">
                            <div style="font-size: 9px; color: ${boldRed}; margin-bottom: 4px;">${labels.id}</div>
                            <div style="font-size: 18px; font-weight: 900; color: #FFFFFF;">${labels.idValue}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding: 50px 55px;">
                <div style="background: linear-gradient(135deg, ${boldRed}11 0%, transparent 100%); border-left: 6px solid ${boldRed}; padding: 25px; margin-bottom: 40px;">
                    <div style="font-size: 22px; font-weight: 900; color: ${boldRed}; margin-bottom: 10px;">${clientName}</div>
                    <div style="font-size: 15px; color: #555555;">${clientAddress}</div>
                </div>
                <table style="width: 100%; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, ${deepBlack} 0%, #2A4A6C 100%);">
                            <th style="text-align: left; padding: 22px 20px; color: #FFFFFF;">DESCRIPTION</th>
                            <th style="text-align: center; padding: 22px 20px; color: #FFFFFF; width: 80px;">QTY</th>
                            <th style="text-align: right; padding: 22px 20px; color: #FFFFFF; width: 125px;">RATE</th>
                            <th style="text-align: right; padding: 22px 20px; color: #FFFFFF; width: 135px;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 420px; background: ${deepBlack}; padding: 35px; transform: skewX(-2deg);">
                        <div style="transform: skewX(2deg);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; color: #AAAAAA;">
                                <span>SUBTOTAL</span>
                                <span style="color: #FFFFFF; font-weight: 800;">${formatMoney(subtotal)}</span>
                            </div>
                            ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 15px; color: #AAAAAA;"><span>TAX (${data.taxRate}%)</span><span style="color: #FFFFFF; font-weight: 800;">${formatMoney(tax)}</span></div>` : ''}
                            <div style="border-top: 3px solid ${boldRed}; margin: 25px 0; padding-top: 25px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-size: 12px; font-weight: 900; color: ${boldRed};">TOTAL</span>
                                    <span style="font-size: 42px; font-weight: 900; color: ${boldRed};">${formatMoney(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="background: ${deepBlack}; padding: 30px; text-align: center;">
                <div style="font-size: 14px; color: ${boldRed}; margin-bottom: 8px; font-weight: 900;">${companyName}</div>
                <div style="font-size: 12px; color: #AAAAAA;">${companyAddress}</div>
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
        <tr style="border-bottom: 1px solid #F0E9F0; background: ${index % 2 === 0 ? '#FDFCFD' : '#FFFFFF'};">
            <td style="padding: 20px 22px; color: #555555; font-weight: 500;">${item.description}</td>
            <td style="padding: 20px 22px; text-align: center; color: #A855F7; font-weight: 700; background: linear-gradient(135deg, #FAE8FF 0%, #F5E6FF 100%); border-radius: 8px;">${item.quantity}</td>
            <td style="padding: 20px 22px; text-align: right; color: #666666;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px 22px; text-align: right; font-weight: 700; color: #EC4899;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: 'Quicksand', 'Trebuchet MS', sans-serif; background: linear-gradient(135deg, #FFF5F7 0%, #F0F9FF 50%, #FAF5FF 100%); padding: 50px 0; min-height: 1000px;">
        <div style="max-width: 820px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); border-radius: 35px; overflow: hidden; box-shadow: 0 20px 60px rgba(200, 150, 200, 0.2);">
            <div style="padding: 45px 50px 50px; background: linear-gradient(135deg, #FFE4F6 0%, #E0F2FE 50%, #F3E8FF 100%);">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1;">
                        ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 55px; border-radius: 12px; margin-bottom: 22px;" />` : `<h2 style=margin: 0 0 22px 0; font-size: 26px; color: #A855F7;">${companyName}</h2>`}
                        <div style="font-size: 13px; color: #8B7B8B;">
                            ${companyAddress ? `<div>💌 ${companyAddress}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 46px; font-weight: 800; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${title}</h1>
                        <div style="background: rgba(255, 255, 255, 0.9); padding: 20px 26px; border-radius: 20px; margin-top: 22px; display: inline-block;">
                            <div style="font-size: 10px; color: #A855F7; margin-bottom: 5px;">${labels.id}</div>
                            <div style="font-size: 17px; font-weight: 700;">${labels.idValue}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding: 45px 50px;">
                <div style="background: linear-gradient(135deg, #FAF5FF 0%, #FFF1F2 100%); border-radius: 25px; padding: 28px; margin-bottom: 40px; border: 2px solid rgba(168, 85, 247, 0.15);">
                    <div style="font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px;">${clientName}</div>
                    <div style="font-size: 15px; color: #666666;">${clientAddress}</div>
                </div>
                <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #A855F7 0%, #EC4899 100%); border-radius: 16px;">
                            <th style="text-align: left; padding: 20px 22px; color: #FFFFFF; border-radius: 16px 0 0 16px;">Item</th>
                            <th style="text-align: center; padding: 20px 22px; color: #FFFFFF; width: 90px;">Quantity</th>
                            <th style="text-align: right; padding: 20px 22px; color: #FFFFFF; width: 125px;">Rate</th>
                            <th style="text-align: right; padding: 20px 22px; color: #FFFFFF; width: 135px; border-radius: 0 16px 16px 0;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 410px; background: linear-gradient(135deg, #FAF5FF 0%, #FFF1F2 100%); border-radius: 25px; padding: 35px; border: 2px solid rgba(168, 85, 247, 0.2);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; color: #666666;">
                            <span>Subtotal</span>
                            <span style="font-weight: 700;">${formatMoney(subtotal)}</span>
                        </div>
                        ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 15px; color: #666666;"><span>Tax (${data.taxRate}%)</span><span style="font-weight: 700;">${formatMoney(tax)}</span></div>` : ''}
                        <div style="border-top: 2px solid rgba(168, 85, 247, 0.3); margin: 24px 0; padding-top: 24px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="font-size: 13px; font-weight: 800; color: #A855F7;">Total</span>
                                <span style="font-size: 40px; font-weight: 900; background: linear-gradient(135deg, #EC4899 0%, #A855F7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${formatMoney(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="background: linear-gradient(135deg, #FFE4F6 0%, #E0F2FE 50%, #F3E8FF 100%); padding: 35px 50px; text-align: center;">
                <div style="font-size: 15px; font-weight: 700; background: linear-gradient(135deg, #A855F7 0%, #EC4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px;">${companyName}</div>
                <div style="font-size: 12px; color: #8B7B8B;">${companyAddress}</div>
                <div style="margin-top: 18px; font-size: 11px; color: #A8A8A8;">✨ Made with care ✨</div>
            </div>
        </div>
    </div>
    `;
};
