import { InvoiceData, UserProfile } from '../../types';

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

// TEMPLATE 16: SWISS GRID
export const getSwissGridHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const swissRed = '#FF0000';
    const black = '#000000';
    const white = '#FFFFFF';

    const companyName = data.companyName || profile.companyName || 'Company Name';
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 2px solid ${black};">
            <td style="padding: 15px; font-weight: bold; border-right: 2px solid ${black};">${item.description}</td>
            <td style="padding: 15px; text-align: center; border-right: 2px solid ${black};">${item.quantity}</td>
            <td style="padding: 15px; text-align: right; border-right: 2px solid ${black};">${formatMoney(item.rate)}</td>
            <td style="padding: 15px; text-align: right; font-weight: bold;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #F5F5F5; padding: 0; min-height: 1000px; font-family: 'Helvetica', 'Arial', sans-serif;">
        <!-- Swiss Grid Layout -->
        <div style="display: grid; grid-template-columns: 200px 1fr; min-height: 1000px; border-left: 20px solid ${swissRed};">
            
            <!-- Left Sidebar -->
            <div style="background: ${white}; padding: 40px 20px; border-right: 2px solid ${black};">
                <div style="font-size: 60px; font-weight: 900; line-height: 0.8; margin-bottom: 40px; color: ${black}; transform: rotate(-90deg) translateX(-100%); transform-origin: top left; white-space: nowrap; position: absolute; margin-top: 300px;">
                    ${title}
                </div>
                
                <div style="margin-top: 400px;">
                    <div style="font-weight: 900; font-size: 14px; margin-bottom: 5px; color: ${swissRed};">DATE</div>
                    <div style="font-size: 18px; margin-bottom: 20px;">${labels.dateValue}</div>
                    
                    <div style="font-weight: 900; font-size: 14px; margin-bottom: 5px; color: ${swissRed};">NUMBER</div>
                    <div style="font-size: 18px; margin-bottom: 20px;">${labels.idValue}</div>
                    
                    <div style="font-weight: 900; font-size: 14px; margin-bottom: 5px; color: ${swissRed};">ISSUED BY</div>
                    <div style="font-size: 16px; margin-bottom: 20px;">${companyName}</div>
                </div>
            </div>

            <!-- Main Content -->
            <div style="background: ${white}; padding: 60px;">
                 <div style="border-bottom: 10px solid ${black}; margin-bottom: 40px; padding-bottom: 10px;">
                    <h1 style="font-size: 48px; font-weight: 900; margin: 0; letter-spacing: -2px;">${companyName}</h1>
                    <div style="font-weight: bold;">${data.companyAddress || ''}</div>
                 </div>

                 <div style="margin-bottom: 60px;">
                    <div style="font-weight: 900; font-size: 14px; color: ${swissRed}; margin-bottom: 10px;">CLIENT</div>
                    <div style="font-size: 24px; font-weight: bold;">${data.clientName || 'Client Name'}</div>
                    <div style="font-size: 16px;">${data.clientAddress || ''}</div>
                 </div>

                 <table style="width: 100%; border: 2px solid ${black}; border-collapse: collapse;">
                    <thead style="background: ${black}; color: ${white};">
                        <tr>
                            <th style="padding: 15px; text-align: left; text-transform: uppercase;">Description</th>
                            <th style="padding: 15px; text-align: center; text-transform: uppercase;">Qty</th>
                            <th style="padding: 15px; text-align: right; text-transform: uppercase;">Rate</th>
                            <th style="padding: 15px; text-align: right; text-transform: uppercase;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                 </table>

                 <div style="margin-top: 40px; text-align: right;">
                    <div style="display: inline-block; text-align: left;">
                         <div style="display: flex; justify-content: space-between; width: 300px; padding: 10px 0; border-bottom: 2px solid ${black};">
                             <span style="font-weight: bold;">SUBTOTAL</span>
                             <span>${formatMoney(subtotal)}</span>
                         </div>
                         <div style="display: flex; justify-content: space-between; width: 300px; padding: 20px 0; font-size: 32px; font-weight: 900; color: ${swissRed};">
                             <span>TOTAL</span>
                             <span>${formatMoney(total)}</span>
                         </div>
                    </div>
                 </div>
            </div>
        </div>
    </div>`;
};

// TEMPLATE 17: SPACE ODYSSEY
export const getSpaceOdysseyHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
            <td style="padding: 15px; color: #E0E0E0;">${item.description}</td>
            <td style="padding: 15px; text-align: center; color: #BB86FC;">${item.quantity}</td>
            <td style="padding: 15px; text-align: right; color: #03DAC6;">${formatMoney(item.rate)}</td>
            <td style="padding: 15px; text-align: right; color: #FFFFFF; font-weight: bold; text-shadow: 0 0 10px rgba(255,255,255,0.5);">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #050510; color: #FFFFFF; padding: 0; min-height: 1000px; font-family: 'Verdana', sans-serif; position: relative; overflow: hidden;">
        <!-- Space Background -->
        <div style="position: absolute; width: 2px; height: 2px; background: white; box-shadow: 10px 10px white, 50px 80px white, 100px 20px white; border-radius: 50%;"></div>
         <div style="position: absolute; inset: 0; background: radial-gradient(circle at 50% -20%, #20002c, #090014 40%, #000000 80%);"></div>
         <div style="position: absolute; top: 100px; right: -50px; width: 300px; height: 300px; background: radial-gradient(circle, #7B1FA2 0%, transparent 70%); opacity: 0.3; filter: blur(50px);"></div>

        <div style="position: relative; z-index: 10; padding: 60px;">
            <div style="text-align: center; margin-bottom: 80px;">
                <h1 style="font-size: 32px; letter-spacing: 10px; text-transform: uppercase; font-weight: 100; color: #03DAC6; text-shadow: 0 0 20px #03DAC6;">${title}</h1>
                <div style="font-size: 12px; letter-spacing: 3px; margin-top: 10px; color: #BB86FC;">ID: ${labels.idValue} // STARDATE: ${labels.dateValue}</div>
            </div>

            <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 30px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 50px; backdrop-filter: blur(5px);">
                <div>
                     <div style="color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">ORIGIN</div>
                     <div style="font-size: 18px; color: #fff; margin-top: 5px;">${data.companyName || profile.companyName}</div>
                     <div style="font-size: 12px; color: #aaa; margin-top: 2px;">${data.companyAddress || ''}</div>
                </div>
                <div style="text-align: right;">
                     <div style="color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">DESTINATION Sector</div>
                     <div style="font-size: 18px; color: #fff; margin-top: 5px;">${data.clientName || 'Client Name'}</div>
                     <div style="font-size: 12px; color: #aaa; margin-top: 2px;">${data.clientAddress || ''}</div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #03DAC6;">
                        <th style="padding: 15px; text-align: left; color: #03DAC6; text-transform: uppercase; font-size: 12px; letter-spacing: 2px;">Payload</th>
                        <th style="padding: 15px; text-align: center; color: #03DAC6; text-transform: uppercase; font-size: 12px; letter-spacing: 2px;">Units</th>
                        <th style="padding: 15px; text-align: right; color: #03DAC6; text-transform: uppercase; font-size: 12px; letter-spacing: 2px;">Cost/Unit</th>
                        <th style="padding: 15px; text-align: right; color: #03DAC6; text-transform: uppercase; font-size: 12px; letter-spacing: 2px;">Value</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; margin-top: 50px;">
                <div style="background: rgba(3, 218, 198, 0.1); border: 1px solid #03DAC6; padding: 30px; border-radius: 10px; width: 300px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: #E0E0E0;">
                        <span>Subtotal</span>
                        <span>${formatMoney(subtotal)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 24px; color: #ffffff; text-shadow: 0 0 10px #ffffff; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 20px;">
                        <span>TOTAL</span>
                        <span>${formatMoney(total)}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
};

// TEMPLATE 18: RETRO TERMINAL
export const getRetroTerminalHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const phosphor = '#33ff00';
    const bg = '#0a0a0a';

    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px dashed ${phosphor};">
            <td style="padding: 10px;">> ${item.description}</td>
            <td style="padding: 10px; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px; text-align: right;">${formatMoney(item.rate)}</td>
            <td style="padding: 10px; text-align: right;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: ${bg}; color: ${phosphor}; padding: 40px; min-height: 1000px; font-family: 'Courier New', monospace; text-shadow: 0 0 4px ${phosphor}; position: relative; overflow: hidden;">
        <!-- Scanlines -->
        <div style="position: absolute; inset: 0; background: repeating-linear-gradient(transparent 0px, transparent 2px, rgba(0,0,0,0.5) 3px); pointer-events: none;"></div>
        
        <div style="border: 2px solid ${phosphor}; padding: 20px; max-width: 900px; margin: 0 auto; box-shadow: 0 0 20px ${phosphor}, inset 0 0 20px ${phosphor}; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px double ${phosphor}; padding-bottom: 20px;">
                <pre style="margin: 0; font-size: 10px;">
   _____ ____  __  __
  / ____/ __ \\|  \\/  |
 | |   | |  | | \\  / |
 | |   | |  | | |\\/| |
 | |___| |__| | |  | |
  \\_____\\____/|_|  |_|
                </pre>
                <div style="font-size: 24px; font-weight: bold; margin-top: 10px;">${data.companyName || profile.companyName}</div>
                <div style="font-size: 12px;">SYSTEM.DOC.TYPE: ${title}</div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div>[USER_ROOT]</div>
                    <div>${labels.id}: ${labels.idValue}</div>
                    <div>${labels.date}: ${labels.dateValue}</div>
                </div>
                <div style="text-align: right;">
                    <div>[TARGET_CLIENT]</div>
                    <div>${data.clientName || 'UNKNOWN'}</div>
                    <div>${data.clientAddress || 'N/A'}</div>
                </div>
            </div>

            <div style="margin-bottom: 20px;">EXECUTING LINE ITEMS...</div>
            <table style="width: 100%; border-collapse: collapse; color: ${phosphor};">
                <thead>
                    <tr style="border-bottom: 1px solid ${phosphor};">
                        <th style="text-align: left; padding: 10px;">ITEM_DESC</th>
                        <th style="text-align: center; padding: 10px;">QTY</th>
                        <th style="text-align: right; padding: 10px;">RATE_VAL</th>
                        <th style="text-align: right; padding: 10px;">SUM</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; margin-top: 40px;">
                <div style="width: 300px;">
                    <div style="display: flex; justify-content: space-between;">
                         <span>CALC_SUBTOTAL:</span>
                         <span>${formatMoney(subtotal)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; border-top: 1px solid ${phosphor}; padding-top: 10px; font-size: 20px; font-weight: bold;">
                         <span>FINAL_TOTAL:</span>
                         <span style="background: ${phosphor}; color: ${bg}; padding: 0 5px;">${formatMoney(total)}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 40px; text-align: center; font-size: 12px; animation: blink 1s step-end infinite;">
                _END_OF_TRANSMISSION
            </div>
            <style>
                @keyframes blink { 50% { opacity: 0; } }
            </style>
        </div>
    </div>`;
};

// TEMPLATE 19: PLAYFUL POP
export const getPlayfulPopHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="background: white; border: 3px solid black;">
            <td style="padding: 15px; font-weight: bold;">${item.description}</td>
            <td style="padding: 15px; text-align: center; color: #ff00de;">${item.quantity}</td>
            <td style="padding: 15px; text-align: right; color: #00e5ff;">${formatMoney(item.rate)}</td>
            <td style="padding: 15px; text-align: right; font-weight: 900; background: #fff000;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #fff000; padding: 40px; min-height: 1000px; font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif; position: relative;">
        <!-- Halftone Pattern -->
        <div style="position: absolute; inset: 0; background-image: radial-gradient(black 1px, transparent 1px); background-size: 10px 10px; opacity: 0.1;"></div>
        
        <div style="position: relative; background: white; border: 5px solid black; padding: 30px; box-shadow: 15px 15px 0px #00e5ff;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 50px;">
                 <div style="background: #ff00de; color: white; padding: 20px; transform: rotate(-3deg); border: 3px solid black; box-shadow: 5px 5px 0 black;">
                     <h1 style="margin: 0; font-size: 40px; text-transform: uppercase; -webkit-text-stroke: 2px black;">${title}!!!</h1>
                 </div>
                 
                 <div style="background: white; border: 3px solid black; padding: 20px; border-radius: 50%; width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; text-align: center; box-shadow: 5px 5px 0 black;">
                     <div>
                         <div style="font-size: 12px; font-weight: bold;">DATE</div>
                         <div style="font-size: 16px; color: #00e5ff; font-weight: 900;">${labels.dateValue}</div>
                     </div>
                 </div>
            </div>

            <div style="margin-bottom: 40px; background: #00e5ff; border: 3px solid black; padding: 20px; transform: skewX(-5deg);">
                 <h2 style="margin: 0; text-transform: uppercase;">${data.companyName || profile.companyName}</h2>
            </div>
            
            <div style="margin-bottom: 40px; text-align: right;">
                 <span style="background: black; color: white; padding: 5px 10px; font-weight: bold; font-size: 20px;">TO:</span>
                 <div style="font-size: 30px; font-weight: 900; margin-top: 10px;">${data.clientName || 'Client'}</div>
            </div>

            <table style="width: 100%; border-collapse: separate; border-spacing: 0 10px; margin-bottom: 30px;">
                <thead>
                    <tr>
                        <th style="background: black; color: white; padding: 10px;">WHAT?</th>
                        <th style="background: black; color: white; padding: 10px;">QTY</th>
                        <th style="background: black; color: white; padding: 10px;">PRICE</th>
                        <th style="background: black; color: white; padding: 10px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="display: flex; justify-content: center; margin-top: 50px;">
                 <div style="background: #ff00de; padding: 30px 60px; border: 5px solid black; transform: rotate(2deg); box-shadow: 10px 10px 0 #fff000;">
                     <div style="font-size: 20px; color: white; font-weight: bold;">TOTAL AMOUNT</div>
                     <div style="font-size: 50px; font-weight: 900; color: white; -webkit-text-stroke: 2px black;">${formatMoney(total)}</div>
                 </div>
            </div>
        </div>
    </div>`;
};

// TEMPLATE 20: ELEGANT SERIF
export const getElegantSerifHtmlTemplate = (
    data: any,
    profile: UserProfile,
    title: string,
    labels: { date: string, id: string, idValue: string, dateValue: string }
): string => {
    const items = data.lineItems || [];
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0);
    const total = subtotal + (data.tax || 0);

    const rows = items.map((item: any) => `
        <tr style="border-bottom: 1px solid #CCC;">
            <td style="padding: 15px 5px; font-style: italic;">${item.description}</td>
            <td style="padding: 15px 5px; text-align: center;">${item.quantity}</td>
            <td style="padding: 15px 5px; text-align: right;">${formatMoney(item.rate)}</td>
            <td style="padding: 15px 5px; text-align: right;">${formatMoney(item.quantity * item.rate)}</td>
        </tr>
    `).join('');

    return `
    <div style="background-color: #FDFBF7; padding: 80px; min-height: 1000px; font-family: 'Times New Roman', serif; color: #333;">
        <div style="text-align: center; margin-bottom: 60px; border-bottom: 1px solid #333; padding-bottom: 40px;">
             <div style="font-size: 48px; letter-spacing: 2px; margin-bottom: 10px; font-variant: small-caps;">${data.companyName || profile.companyName}</div>
             <div style="font-size: 14px; color: #666; letter-spacing: 1px; text-transform: uppercase;">Legal & Professional Services</div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 60px;">
             <div>
                 <div style="font-variant: small-caps; font-weight: bold; border-bottom: 1px solid #333; margin-bottom: 10px; display: inline-block;">Prepared For:</div>
                 <div style="font-size: 18px; margin-bottom: 5px;">${data.clientName || 'Client Name'}</div>
                 <div style="font-size: 14px; color: #555;">${data.clientAddress || ''}</div>
             </div>
             <div style="text-align: right;">
                 <div style="font-variant: small-caps; font-weight: bold; border-bottom: 1px solid #333; margin-bottom: 10px; display: inline-block;">Document Details:</div>
                 <div style="font-size: 14px; margin-bottom: 5px;"><span style="font-style: italic;">Ref:</span> ${labels.idValue}</div>
                 <div style="font-size: 14px; margin-bottom: 5px;"><span style="font-style: italic;">Date:</span> ${labels.dateValue}</div>
             </div>
        </div>

        <div style="margin-bottom: 60px;">
             <div style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 3px;">${title}</div>
             
             <table style="width: 100%; border-collapse: collapse; border-top: 2px solid #333; border-bottom: 2px solid #333;">
                <thead>
                    <tr>
                        <th style="padding: 15px 5px; text-align: left; font-weight: normal; font-style: italic; border-bottom: 1px solid #333;">Item Description</th>
                        <th style="padding: 15px 5px; text-align: center; font-weight: normal; font-style: italic; border-bottom: 1px solid #333;">Qty</th>
                        <th style="padding: 15px 5px; text-align: right; font-weight: normal; font-style: italic; border-bottom: 1px solid #333;">Unit Price</th>
                        <th style="padding: 15px 5px; text-align: right; font-weight: normal; font-style: italic; border-bottom: 1px solid #333;">Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
             </table>
        </div>

        <div style="display: flex; justify-content: flex-end;">
             <div style="width: 250px;">
                 <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                     <span>Subtotal</span>
                     <span>${formatMoney(subtotal)}</span>
                 </div>
                 <div style="border-top: 1px solid #333; border-bottom: 3px double #333; padding: 15px 0; display: flex; justify-content: space-between; font-size: 20px; font-weight: bold; margin-top: 10px;">
                     <span>Total Due</span>
                     <span>${formatMoney(total)}</span>
                 </div>
             </div>
        </div>

        <div style="margin-top: 100px; text-align: center; font-size: 12px; color: #666;">
             <div style="margin-bottom: 20px;">___________________________</div>
             Authorized Signature
        </div>
    </div>`;
};
