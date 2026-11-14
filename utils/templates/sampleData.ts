/**
 * Realistic sample documents for template thumbnails, the marketing gallery and the template QA script.
 */
import { FormType } from '../../types.ts';
import type { DocKind } from './model.ts';
import { KIND_TO_FORM_TYPE } from './model.ts';

const b64 = (s: string): string => {
  if (typeof btoa === 'function') return btoa(s);
  return (globalThis as any).Buffer.from(s, 'utf8').toString('base64');
};

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${b64(svg)}`;

export const SAMPLE_LOGO = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="96" viewBox="0 0 300 96">'
  + '<path d="M8 74 L44 22 L62 46 L74 32 L104 74 Z" fill="#2b3a4a"/><path d="M44 22 L56 39 L50 39 L44 30 L38 39 L32 39 Z" fill="#e0a526"/>'
  + '<text x="114" y="50" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#2b3a4a">SUMMIT</text>'
  + '<text x="115" y="72" font-family="Arial, Helvetica, sans-serif" font-size="13" letter-spacing="3.2" fill="#5b6b7a">RIDGE BUILDERS</text></svg>',
);

export const SAMPLE_SIGNATURE = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="80" viewBox="0 0 260 80">'
  + '<path d="M12 58 C 28 20, 40 14, 44 40 S 52 70, 66 44 S 86 18, 92 46 S 104 66, 118 40 C 126 26, 136 30, 132 46 C 128 60, 146 56, 160 38 S 186 30, 196 46 C 204 58, 224 50, 248 34" fill="none" stroke="#1f2a44" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);

export const SAMPLE_CLIENT_SIGNATURE = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">'
  + '<path d="M14 52 C 30 30, 44 22, 52 36 C 58 48, 46 62, 38 52 C 32 44, 60 26, 78 38 S 96 62, 112 40 S 140 22, 150 44 C 156 58, 176 50, 188 36 S 214 30, 228 42" fill="none" stroke="#243b6b" stroke-width="2.6" stroke-linecap="round"/></svg>',
);

export const SAMPLE_PROFILE = {
  id: 'sample-profile',
  email: 'office@summitridgebuild.com',
  name: 'Daniel Reyes',
  companyName: 'Summit Ridge Builders',
  logoUrl: SAMPLE_LOGO,
  address: '418 Cedar Hollow Rd\nAsheville, NC 28803',
  phone: '(828) 555-0142',
  website: 'summitridgebuild.com',
  jobTitle: 'General Contractor',
};

export const SAMPLE_JOB = {
  id: 'sample-job',
  userId: 'sample-profile',
  name: 'Hillside Kitchen Remodel',
  clientName: 'Margaret Collins',
  clientAddress: '27 Laurel Ridge Dr\nAsheville, NC 28804',
  startDate: '2026-10-01',
  endDate: null,
  status: 'active' as const,
};

const company = {
  companyName: SAMPLE_PROFILE.companyName,
  companyAddress: SAMPLE_PROFILE.address,
  companyPhone: SAMPLE_PROFILE.phone,
  companyWebsite: SAMPLE_PROFILE.website,
  logoUrl: SAMPLE_LOGO,
};
const client = { clientName: SAMPLE_JOB.clientName, clientAddress: SAMPLE_JOB.clientAddress };

/** [description, quantity, rate, unit?] → line items (the unit is what Quick measure sets: "sq ft", "lf"…) */
const lines = (rows: Array<[string, number, number, string?]>) =>
  rows.map(([description, quantity, rate, unit], i) => ({ id: `li-${i + 1}`, description, quantity, rate, ...(unit ? { unit } : {}) }));

export const SAMPLE_DOCUMENTS: Record<DocKind, Record<string, any>> = {
  invoice: {
    ...company, ...client,
    invoiceNumber: 'INV-2026-1042', issueDate: '2026-11-05', dueDate: '2026-12-05', status: 'Sent',
    lineItems: [
      ...lines([
        ['Demolition & haul-away of existing cabinets and countertops', 1, 1850],
        ['Custom shaker cabinets, white oak', 22, 385, 'lf'],
        ['Quartz countertop fabrication & install', 48, 92, 'sq ft'],
        ['Electrical: under-cabinet lighting circuit', 1, 1240],
      ]),
      { id: 'li-5', description: 'Plumbing rough-in kit', quantity: 1, rate: 960, isAssembly: true, assemblyComponents: [{ item_id: 'a', name: 'PEX supply lines', quantity: 4, rate: 0 }, { item_id: 'b', name: 'Shut-off valves', quantity: 2, rate: 0 }] },
    ],
    taxRate: 7, discount: 500, shipping: 0,
    notes: 'Thank you for choosing Summit Ridge Builders. Final walkthrough is scheduled for December 2.',
    terms: 'Payment due within 30 days. A 1.5% monthly finance charge applies to overdue balances.',
    paypalLink: 'https://www.paypal.com/paypalme/summitridge/250',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  estimate: {
    ...company, ...client,
    estimateNumber: 'EST-2026-318', issueDate: '2026-10-12', expiryDate: '2026-11-11', status: 'Accepted',
    lineItems: lines([
      ['Site protection, dust barriers and floor covering', 1, 640],
      ['Frame new pantry wall with pocket door', 1, 2150],
      ['Drywall, tape, mud and two coats of paint', 380, 4.25, 'sq ft'],
      ['LVP flooring supply & install', 260, 7.4, 'sq ft'],
      ['Final clean & debris removal', 1, 420],
    ]),
    notes: 'Pricing includes materials, labor and permits. Appliances are supplied by the owner.',
    terms: '50% deposit to schedule, 40% at rough-in inspection, 10% on completion. Estimate valid for 30 days.',
    signatureUrl: SAMPLE_SIGNATURE,
    clientSignatureUrl: SAMPLE_CLIENT_SIGNATURE, clientSignedAt: '2026-10-14T15:20:00', clientSignedBy: 'Margaret Collins',
  },
  workOrder: {
    ...company, ...client,
    workOrderNumber: 'WO-2026-087', date: '2026-11-08', status: 'In Progress',
    description: 'Replace the failed water heater in the basement utility room.\nInstall a new 50-gallon high-efficiency unit, new expansion tank and code-compliant T&P discharge line.',
    materialsUsed: '50 gal HE water heater, expansion tank, 3/4" copper fittings, gas flex connector, discharge pipe',
    hours: 6.5, cost: 2480,
    terms: 'Work guaranteed for 12 months. Additional work requires a signed change order.',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  dailyReport: {
    ...company,
    reportNumber: 'DR-2026-11-014', date: '2026-11-09', weather: 'Partly cloudy', temperature: '54°F',
    projectName: 'Hillside Kitchen Remodel', clientName: 'Margaret Collins', projectAddress: '27 Laurel Ridge Dr, Asheville, NC 28804',
    tags: ['Framing', 'Inspection'],
    content: '<h3>Summary</h3><p>Crew of <strong>4</strong> completed pantry wall framing and set blocking for upper cabinets. Work progressed on schedule with no safety incidents.</p>'
      + '<h3>Work Completed</h3><ul><li>Framed pantry wall and pocket door header</li><li>Installed blocking for upper cabinets along the north wall</li><li>Ran new 20A circuit for under-cabinet lighting</li></ul>'
      + '<h3>Materials Delivered</h3><ul><li>2x4 studs (60 pcs), LVL header</li><li>Electrical boxes and 12/2 wire</li></ul>'
      + '<h3>Issues &amp; Delays</h3><p>Minor 3/8" floor dip at the island location; leveling compound scheduled.</p>'
      + '<h3>Next Steps</h3><p>Rough electrical inspection tomorrow at 9:00 AM, then drywall delivery.</p>',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  timeSheet: {
    ...company, ...client,
    workerName: 'Luis Ortega', date: '2026-11-07', hoursWorked: 8, overtimeHours: 1.5, status: 'Approved',
    notes: 'Cabinet install (north wall), adjusted door hinges, cleanup.',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  materialLog: {
    ...company, ...client,
    date: '2026-11-06', projectName: 'Hillside Kitchen Remodel',
    items: [
      { id: 'm1', name: '2x4x8 KD studs', supplier: 'Blue Ridge Lumber', quantity: 60, unitCost: 4.85 },
      { id: 'm2', name: '1/2" drywall sheets 4x8', supplier: 'Blue Ridge Lumber', quantity: 28, unitCost: 14.2 },
      { id: 'm3', name: '12/2 Romex (250 ft)', supplier: 'City Electric Supply', quantity: 2, unitCost: 118 },
      { id: 'm4', name: 'Construction adhesive', supplier: 'Home Depot Pro', quantity: 12, unitCost: 6.4 },
    ],
    signatureUrl: SAMPLE_SIGNATURE,
  },
  expenseLog: {
    ...company, ...client,
    date: '2026-11-04', vendor: 'Home Depot Pro', category: 'Material', item: '',
    lineItems: lines([['Tile spacers and grout float', 1, 38.5], ['Diamond blade 7"', 2, 46], ['Shop vacuum filters', 3, 17.99]]),
    tax: 9.86, amount: 194.33, notes: 'Charged to company card ending 4410.',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  warranty: {
    ...company,
    warrantyNumber: 'WAR-2026-021', clientName: 'Margaret Collins', projectAddress: '27 Laurel Ridge Dr, Asheville, NC 28804',
    completedDate: '2026-12-02', duration: '2 years',
    coverage: 'Workmanship on cabinetry installation, countertop seams, plumbing connections and electrical work performed by Summit Ridge Builders.',
    conditions: 'Excludes normal wear, misuse, owner-supplied materials and appliances, and damage caused by others. Claims must be reported in writing within 30 days of discovery.',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  note: {
    title: 'Pre-drywall walkthrough with owner',
    content: '<p>Walked the kitchen with <strong>Margaret</strong> before close-in.</p><ul><li>Confirmed outlet heights at the island (42")</li><li>Owner requested a second USB outlet in the pantry</li><li>Approved pocket door location</li></ul><p>Follow-up: send change order for the extra outlet.</p>',
    tags: ['Owner meeting', 'Electrical'],
    date: '2026-11-09',
  },
  receipt: {
    ...company, ...client,
    receiptNumber: 'RCPT-2026-077', date: '2026-11-10', amount: 6000,
    description: 'Deposit for Hillside Kitchen Remodel (Invoice INV-2026-1042)', paymentMethod: 'Check #2219',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  changeOrder: {
    ...company, ...client,
    changeOrderNumber: 'CO-2026-005', date: '2026-11-09', reason: 'Client request',
    description: 'Add a second USB outlet in the pantry and upgrade the pantry door to solid-core.',
    currentContractSum: 38450,
    lineItems: lines([['USB duplex outlet with new circuit extension', 1, 285], ['Solid-core pocket door upgrade', 1, 410]]),
    terms: 'This change order becomes part of the original contract once signed by both parties.',
    signatureUrl: SAMPLE_SIGNATURE,
  },
  purchaseOrder: {
    ...company,
    poNumber: 'PO-2026-133', date: '2026-11-03', deliveryDate: '2026-11-12', status: 'Sent',
    vendorName: 'Blue Ridge Lumber Co.', vendorAddress: '90 Riverside Dr\nAsheville, NC 28801', vendorPhone: '(828) 555-0199', vendorEmail: 'orders@blueridgelumber.com',
    shipToType: 'Job Site', shipToName: 'Hillside Kitchen Remodel', shipToAddress: '27 Laurel Ridge Dr\nAsheville, NC 28804', shipToPhone: '(828) 555-0142',
    deliveryInstructions: 'Deliver to the side driveway before 10 AM. Call the site lead 30 minutes before arrival.',
    lineItems: lines([['LVL beam 1-3/4" x 11-7/8" x 16\'', 2, 168], ['2x4x8 KD studs', 60, 4.85], ['1/2" drywall sheets 4x8', 28, 14.2]]),
    notes: 'Please include the delivery ticket with the order.',
    taxRate: 7, shipping: 75,
    signatureUrl: SAMPLE_SIGNATURE,
  },
  profitReport: {
    ...company,
    reportNumber: 'PR-2026-11', date: '2026-11-10',
    items: [
      { id: 'p1', description: 'Cabinetry', cost: 5120, charge: 8470 },
      { id: 'p2', description: 'Countertops', cost: 2890, charge: 4416 },
      { id: 'p3', description: 'Electrical', cost: 640, charge: 1240 },
      { id: 'p4', description: 'Labor', cost: 6200, charge: 9800 },
    ],
    vatEnabled: false, vatRate: 0,
  },
};

export const getSampleDocument = (kind: DocKind): { type: FormType; data: Record<string, any> } => ({
  type: KIND_TO_FORM_TYPE[kind],
  data: SAMPLE_DOCUMENTS[kind],
});
