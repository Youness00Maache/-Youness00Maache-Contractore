import { InvoiceData, UserProfile } from '../../types';

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

// TEMPLATE 11: VINTAGE CRAFT
export const getVintageCraftHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const paperColor = '#FDF5E6'; // Old Lace
    const inkColor = '#4B3621'; // Cafe Noir
    const accentColor = '#8B4513'; // Saddle Brown

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const clientName = data.clientName || '';
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
    const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px dashed ${accentColor};">
            <td style="padding: 15px 10px; font-family: 'Courier New', monospace; color: ${inkColor};">${item.description}</td>
            <td style="padding: 15px 10px; text-align: center; font-family: 'Courier New', monospace; color: ${inkColor};">${item.quantity}</td>
            <td style="padding: 15px 10px; text-align: right; font-family: 'Courier New', monospace; color: ${inkColor};">${formatMoney(item.rate)}</td>
            <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-family: 'Courier New', monospace; color: ${inkColor};">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: ${paperColor}; padding: 60px; min-height: 1000px; font-family: 'Courier New', Courier, monospace; color: ${inkColor}; position: relative;">
        <!-- Vintage Border -->
        <div style="border: 4px double ${inkColor}; padding: 40px; height: 900px; position: relative; background-image: radial-gradient(#8B4513 0.5px, transparent 0.5px); background-size: 20px 20px; background-color: ${paperColor};">
            <div style="background: ${paperColor}; padding: 20px; border: 1px solid ${inkColor}; position: absolute; top: -30px; left: 50%; transform: translateX(-50%);">
                <h1 style="margin: 0; font-size: 32px; text-transform: uppercase; letter-spacing: 4px; border-bottom: 2px solid ${inkColor}; padding-bottom: 5px;">${title}</h1>
            </div>

            <div style="display: flex; justify-content: space-between; margin-top: 40px;">
                <div style="border: 2px solid ${inkColor}; padding: 20px; max-width: 300px; transform: rotate(-1deg);">
                    <h3 style="margin: 0 0 10px 0; border-bottom: 1px solid ${inkColor}; display: inline-block;">FROM:</h3>
                    <div style="font-weight: bold; font-size: 18px; margin-bottom: 5px;">${companyName}</div>
                    <div style="font-size: 14px;">${data.companyAddress || profile.address || ''}</div>
                </div>
                <div style="text-align: right; margin-top: 20px;">
                    <div style="font-size: 16px; margin-bottom: 5px;"><span style="font-weight: bold;">${labels.date}:</span> ${labels.dateValue}</div>
                    <div style="font-size: 16px;"><span style="font-weight: bold;">${labels.id}:</span> ${labels.idValue}</div>
                </div>
            </div>

            <div style="margin-top: 50px; background: rgba(255, 255, 255, 0.5); border: 1px solid ${inkColor}; padding: 20px; transform: rotate(1deg);">
                <h3 style="margin: 0 0 10px 0; border-bottom: 1px solid ${inkColor}; display: inline-block;">TO:</h3>
                <div style="font-weight: bold; font-size: 18px; margin-bottom: 5px;">${clientName}</div>
                <div style="font-size: 14px;">${data.clientAddress || ''}</div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 50px;">
                <thead>
                    <tr style="border-bottom: 2px solid ${inkColor};">
                        <th style="padding: 10px; text-align: left; text-transform: uppercase;">Item</th>
                        <th style="padding: 10px; text-align: center; text-transform: uppercase;">Qty</th>
                        <th style="padding: 10px; text-align: right; text-transform: uppercase;">Rate</th>
                        <th style="padding: 10px; text-align: right; text-transform: uppercase;">Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
                <div style="width: 300px; padding: 20px; border: 2px solid ${inkColor}; background: #FFF8DC;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed ${inkColor};">
                        <span>SUBTOTAL</span>
                        <span>${formatMoney(subtotal)}</span>
                    </div>
                    ${tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span>TAX</span><span>${formatMoney(tax)}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 20px;">
                        <span>TOTAL</span>
                        <span>${formatMoney(total)}</span>
                    </div>
                </div>
            </div>

            <div style="position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 12px; font-style: italic;">
                Thank you for your business.
            </div>
        </div>
        <!-- Stamp Effect -->
        <div style="position: absolute; bottom: 100px; left: 80px; border: 3px double #8B0000; color: #8B0000; padding: 10px 20px; font-weight: bold; font-size: 24px; text-transform: uppercase; transform: rotate(-15deg); opacity: 0.8; letter-spacing: 2px; mask-image: url('data:image/png;base64,...');">
            OFFICIAL
        </div>
    </div>`;
};

// TEMPLATE 12: BLUEPRINT TECH
export const getBlueprintTechHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const blueprintBlue = '#003366';
    const gridColor = 'rgba(255, 255, 255, 0.2)';
    const white = '#FFFFFF';

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px solid ${gridColor};">
            <td style="padding: 12px; color: ${white}; font-family: 'Consolas', monospace; border-right: 1px solid ${gridColor};">${item.description}</td>
            <td style="padding: 12px; text-align: center; color: ${white}; font-family: 'Consolas', monospace; border-right: 1px solid ${gridColor};">${item.quantity}</td>
            <td style="padding: 12px; text-align: right; color: ${white}; font-family: 'Consolas', monospace; border-right: 1px solid ${gridColor};">${formatMoney(item.rate)}</td>
            <td style="padding: 12px; text-align: right; color: ${white}; font-family: 'Consolas', monospace;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: ${blueprintBlue}; padding: 0; min-height: 1000px; font-family: 'Consolas', monospace; color: ${white}; position: relative; overflow: hidden;">
        <!-- Grid Background -->
        <div style="position: absolute; inset: 0; background-image: linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px); background-size: 30px 30px;"></div>
        
        <div style="padding: 50px; position: relative; z-index: 10;">
            <div style="border: 4px solid ${white}; padding: 2px;">
                <div style="border: 2px solid ${white}; padding: 30px;">
                    <div style="display: flex; border-bottom: 4px double ${white}; padding-bottom: 20px; margin-bottom: 30px;">
                        <div style="flex: 2; border-right: 2px solid ${white}; padding-right: 20px;">
                             <h1 style="margin: 0; font-size: 42px; text-transform: uppercase;">${title}</h1>
                             <div style="font-size: 14px; margin-top: 5px;">SPECIFICATION DOC: ${labels.idValue}</div>
                        </div>
                        <div style="flex: 1; padding-left: 20px;">
                             <div style="font-size: 12px; color: #AAA;">PROJECT:</div>
                             <div style="font-size: 18px; margin-bottom: 10px;">${companyName}</div>
                             <div style="font-size: 12px; color: #AAA;">DATE:</div>
                             <div style="font-size: 18px;">${labels.dateValue}</div>
                        </div>
                    </div>

                    <div style="display: flex; margin-bottom: 40px;">
                        <div style="flex: 1; border: 1px solid ${white}; padding: 15px; margin-right: 20px;">
                            <div style="font-size: 10px; background: ${white}; color: ${blueprintBlue}; display: inline-block; padding: 2px 5px; margin-bottom: 10px;">SOURCE</div>
                             <div style="font-size: 16px;">${companyName}</div>
                             <div style="font-size: 12px; margin-top: 5px;">${data.companyAddress || ''}</div>
                        </div>
                        <div style="flex: 1; border: 1px solid ${white}; padding: 15px;">
                            <div style="font-size: 10px; background: ${white}; color: ${blueprintBlue}; display: inline-block; padding: 2px 5px; margin-bottom: 10px;">DESTINATION</div>
                             <div style="font-size: 16px;">${data.clientName || 'Client Name'}</div>
                             <div style="font-size: 12px; margin-top: 5px;">${data.clientAddress || ''}</div>
                        </div>
                    </div>

                    <table style="width: 100%; border: 2px solid ${white}; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.1); border-bottom: 2px solid ${white};">
                                <th style="padding: 10px; text-align: left; border-right: 1px solid ${white};">ITEM NO. / DESC</th>
                                <th style="padding: 10px; text-align: center; border-right: 1px solid ${white}; width: 80px;">QTY</th>
                                <th style="padding: 10px; text-align: right; border-right: 1px solid ${white}; width: 100px;">UNIT</th>
                                <th style="padding: 10px; text-align: right; width: 120px;">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>

                     <div style="display: flex; justify-content: flex-end; margin-top: 30px;">
                        <div style="width: 250px;">
                            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${white};">
                                <span>SUB_TOTAL</span>
                                <span>${formatMoney(subtotal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 15px 0; font-size: 24px; font-weight: bold;">
                                <span>TOTAL</span>
                                <span>${formatMoney(total)}</span>
                            </div>
                        </div>
                     </div>
                </div>
            </div>
            
            <div style="position: absolute; bottom: 20px; right: 20px; border: 2px solid ${white}; padding: 10px;">
                <div style="font-size: 10px;">APPROVED BY</div>
                <div style="height: 40px;"></div>
                <div style="border-top: 1px solid ${white}; font-size: 10px; text-align: center; width: 150px;">SIGNATURE</div>
            </div>
        </div>
    </div>`;
};

// TEMPLATE 13: ABSTRACT MEMPHIS
export const getAbstractMemphisHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const yellow = '#FFD700';
    const teal = '#00CED1';
    const purple = '#9370DB';
    const black = '#000000';
    const white = '#FFFFFF';

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any, i: number) => `
        <tr style="background: ${i % 2 === 0 ? '#FFF' : '#F0F0F0'};">
            <td style="padding: 15px; border-bottom: 2px solid ${black};">${item.description}</td>
            <td style="padding: 15px; text-align: center; border-bottom: 2px solid ${black}; font-weight: bold;">${item.quantity}</td>
            <td style="padding: 15px; text-align: right; border-bottom: 2px solid ${black};">${formatMoney(item.rate)}</td>
            <td style="padding: 15px; text-align: right; border-bottom: 2px solid ${black}; font-weight: bold;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #FFF; padding: 50px; min-height: 1000px; font-family: 'Helvetica', sans-serif; position: relative; overflow: hidden;">
        <!-- Memphis Shapes -->
        <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: ${yellow}; border-radius: 50%; border: 4px solid ${black};"></div>
        <div style="position: absolute; bottom: 100px; left: -30px; width: 150px; height: 150px; background: ${teal}; transform: rotate(45deg); border: 4px solid ${black};"></div>
        <div style="position: absolute; top: 200px; left: 50px; width: 20px; height: 20px; background: ${black}; border-radius: 50%; box-shadow: 40px 0 0 ${black}, 80px 0 0 ${purple};"></div>
        
        <div style="position: relative; z-index: 10;">
            <div style="background: ${black}; color: ${white}; display: inline-block; padding: 20px 40px; transform: skewX(-15deg); box-shadow: 10px 10px 0 ${purple}; margin-bottom: 50px;">
                <h1 style="margin: 0; font-size: 48px; font-weight: 900; transform: skewX(15deg);">${title}</h1>
            </div>

            <div style="display: flex; gap: 40px; margin-bottom: 60px;">
                <div style="flex: 1; border: 4px solid ${black}; padding: 25px; box-shadow: 8px 8px 0 ${teal}; background: #FFF;">
                    <div style="font-weight: 900; font-size: 20px; color: ${black}; text-transform: uppercase; margin-bottom: 10px;">Billed To</div>
                    <div style="font-size: 18px;">${data.clientName || 'Client Name'}</div>
                    <div style="font-size: 14px; margin-top: 5px;">${data.clientAddress || ''}</div>
                </div>
                <div style="flex: 1; border: 4px solid ${black}; padding: 25px; box-shadow: 8px 8px 0 ${yellow}; background: #FFF;">
                     <div style="font-weight: 900; font-size: 20px; color: ${black}; text-transform: uppercase; margin-bottom: 10px;">Details</div>
                     <div style="display: flex; justify-content: space-between; border-bottom: 2px solid ${black}; margin-bottom: 5px;">
                        <span>${labels.id}:</span>
                        <span style="font-weight: bold;">${labels.idValue}</span>
                     </div>
                     <div style="display: flex; justify-content: space-between;">
                        <span>${labels.date}:</span>
                        <span style="font-weight: bold;">${labels.dateValue}</span>
                     </div>
                </div>
            </div>

            <table style="width: 100%; border: 4px solid ${black}; border-collapse: collapse;">
                <thead style="background: ${purple}; color: ${white};">
                    <tr>
                        <th style="padding: 15px; text-align: left; border-bottom: 4px solid ${black};">DESCRIPTION</th>
                        <th style="padding: 15px; text-align: center; border-bottom: 4px solid ${black};">QTY</th>
                        <th style="padding: 15px; text-align: right; border-bottom: 4px solid ${black};">RATE</th>
                        <th style="padding: 15px; text-align: right; border-bottom: 4px solid ${black};">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
                 <div style="background: ${yellow}; border: 4px solid ${black}; padding: 30px; transform: rotate(-2deg); box-shadow: 10px 10px 0 ${black}; min-width: 300px;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-bottom: 10px;">
                        <span>TOTAL:</span>
                        <span>${formatMoney(total)}</span>
                    </div>
                 </div>
            </div>
            
             <div style="margin-top: 60px; text-align: center; font-weight: 900; letter-spacing: 2px;">
                ${companyName.toUpperCase()}
            </div>
        </div>
    </div>`;
};

// TEMPLATE 14: CRIMSON NOIR
export const getCrimsonNoirHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const black = '#0A0A0A';
    const darkGrey = '#1F1F1F';
    const crimson = '#DC143C';
    const white = '#E0E0E0';

    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any, i: number) => `
        <tr style="background: ${i % 2 === 0 ? darkGrey : '#141414'}; color: ${white};">
            <td style="padding: 20px; border-bottom: 1px solid #333;">${item.description}</td>
            <td style="padding: 20px; text-align: center; border-bottom: 1px solid #333; color: ${crimson};">${item.quantity}</td>
            <td style="padding: 20px; text-align: right; border-bottom: 1px solid #333;">${formatMoney(item.rate)}</td>
            <td style="padding: 20px; text-align: right; border-bottom: 1px solid #333;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: ${black}; color: ${white}; padding: 0; min-height: 1000px; font-family: 'Times New Roman', serif;">
        <div style="height: 10px; background: ${crimson}; box-shadow: 0 0 20px ${crimson};"></div>
        
        <div style="padding: 60px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 60px; border-bottom: 1px solid #333; padding-bottom: 20px;">
                <div>
                     <div style="color: ${crimson}; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 5px;">${data.companyName || profile.companyName}</div>
                     <h1 style="margin: 0; font-size: 50px; font-weight: 400; letter-spacing: -1px; text-transform: uppercase;">${title}</h1>
                </div>
                <div style="text-align: right; opacity: 0.7;">
                    <div style="font-size: 14px;">${labels.idValue}</div>
                    <div style="font-size: 14px;">${labels.dateValue}</div>
                </div>
            </div>

            <div style="margin-bottom: 60px;">
                <div style="color: ${crimson}; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Billed To</div>
                <div style="font-size: 24px; margin-top: 10px;">${data.clientName || 'Client Name'}</div>
                <div style="color: #666; margin-top: 5px;">${data.clientAddress || ''}</div>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid ${crimson};">
                        <th style="padding: 15px 20px; text-align: left; color: ${crimson}; font-size: 10px; letter-spacing: 2px;">ITEM</th>
                        <th style="padding: 15px 20px; text-align: center; color: ${crimson}; font-size: 10px; letter-spacing: 2px;">QTY</th>
                        <th style="padding: 15px 20px; text-align: right; color: ${crimson}; font-size: 10px; letter-spacing: 2px;">PRICE</th>
                        <th style="padding: 15px 20px; text-align: right; color: ${crimson}; font-size: 10px; letter-spacing: 2px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; margin-top: 40px;">
                <div style="text-align: right;">
                    <div style="display: flex; justify-content: space-between; width: 250px; margin-bottom: 10px; color: #666;">
                        <span>Subtotal</span>
                        <span>${formatMoney(subtotal)}</span>
                    </div>
                    ${data.tax > 0 ? `<div style="display: flex; justify-content: space-between; width: 250px; margin-bottom: 10px; color: #666;"><span>Tax</span><span>${formatMoney(data.tax)}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; width: 250px; margin-top: 20px; font-size: 28px; color: ${white}; border-top: 1px solid #333; padding-top: 20px;">
                        <span style="font-size: 14px; padding-top: 10px;">TOTAL</span>
                        <span>${formatMoney(total)}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 80px; border-top: 1px solid #333; padding-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #555;">
                <div>PAYMENT DUE WITHIN 30 DAYS</div>
                <div>${data.companyAddress || ''}</div>
            </div>
        </div>
    </div>`;
};

// TEMPLATE 15: WATERCOLOR ARTISTIC
export const getWatercolorArtisticHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
            <td style="padding: 15px; color: #555;">${item.description}</td>
            <td style="padding: 15px; text-align: center; color: #555;">${item.quantity}</td>
            <td style="padding: 15px; text-align: right; color: #555;">${formatMoney(item.rate)}</td>
            <td style="padding: 15px; text-align: right; color: #333; font-weight: bold;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #FFFFFF; padding: 0; min-height: 1000px; font-family: 'Georgia', serif; position: relative;">
        <!-- Watercolor blobs (simulated with CSS gradients) -->
        <div style="position: absolute; top: -100px; left: -100px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(238, 130, 238, 0.2) 0%, rgba(135, 206, 235, 0.2) 50%, transparent 70%); border-radius: 40%; filter: blur(40px);"></div>
        <div style="position: absolute; bottom: -50px; right: -50px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255, 160, 122, 0.2) 0%, rgba(255, 105, 180, 0.2) 50%, transparent 70%); border-radius: 45%; filter: blur(30px);"></div>

        <div style="position: relative; z-index: 10; padding: 60px;">
            <div style="text-align: center; margin-bottom: 60px;">
                ${data.logoUrl ? `<img src="${data.logoUrl}" style="max-height: 80px; margin-bottom: 20px;" />` : `<h1 style="font-size: 36px; color: #333; margin: 0 0 10px 0; font-style: italic;">${data.companyName || profile.companyName}</h1>`}
                <div style="height: 2px; width: 100px; background: linear-gradient(90deg, #FFB6C1, #87CEFA); margin: 0 auto 20px auto;"></div>
                <div style="color: #666; font-size: 14px;">${data.companyAddress || ''}</div>
            </div>

            <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); padding: 30px; border-radius: 15px; border: 1px solid rgba(0,0,0,0.05); margin-bottom: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.02);">
                <div>
                     <div style="font-size: 12px; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">PREPARED FOR</div>
                     <div style="font-size: 20px; color: #333; margin-bottom: 5px;">${data.clientName || 'Client'}</div>
                     <div style="font-size: 14px; color: #666;">${data.clientAddress || ''}</div>
                </div>
                <div style="text-align: right;">
                     <div style="font-size: 32px; color: #333; font-weight: normal; margin-bottom: 10px;">${title}</div>
                     <div style="font-size: 14px; color: #666;">${labels.idValue}</div>
                     <div style="font-size: 14px; color: #666;">${labels.dateValue}</div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 15px; color: #999; font-weight: normal; font-size: 12px;">DESCRIPTION</th>
                        <th style="text-align: center; padding: 15px; color: #999; font-weight: normal; font-size: 12px;">QTY</th>
                        <th style="text-align: right; padding: 15px; color: #999; font-weight: normal; font-size: 12px;">PRICE</th>
                        <th style="text-align: right; padding: 15px; color: #999; font-weight: normal; font-size: 12px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="display: flex; justify-content: flex-end;">
                 <div style="width: 300px; background: rgba(255,255,255,0.8); padding: 25px; border-radius: 15px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: #666;">
                          <span>Subtotal</span>
                          <span>${formatMoney(subtotal)}</span>
                      </div>
                      ${data.tax > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: #666;"><span>Tax</span><span>${formatMoney(data.tax)}</span></div>` : ''}
                      <div style="height: 1px; background: #EEE; margin: 15px 0;"></div>
                      <div style="display: flex; justify-content: space-between; font-size: 24px; color: #333;">
                          <span>Total</span>
                          <span>${formatMoney(total)}</span>
                      </div>
                 </div>
            </div>
            
            <div style="margin-top: 60px; text-align: center; font-size: 12px; color: #AAA;">
                ~ Created with art & soul ~
            </div>
        </div>
    </div>`;
};
