/**
 * Field-placement check ("every value the user types lands in the right box of the PDF").
 *
 * For every document type the forms create, a document is filled with distinctive sentinel values using the
 * EXACT data keys the form writes (components/*Form.tsx, components/forms/Sections.tsx). Then:
 *
 *  1. model level (template independent): each sentinel must land in the expected slot of the DocModel
 *     (party "Bill to", meta "Due date", fact "Weather", section "Notes", total "Tax paid", signature …) and in
 *     no other labelled slot (no swaps, no duplicates), and private values (estimate "Your cost") never appear;
 *  2. render level (every template): each sentinel must be visible, at most as often as the model holds it
 *     (emphasis copies like the key date are allowed), and every occurrence of a labelled value must sit after
 *     ITS OWN label inside the same block (the nearest preceding label is the expected one).
 *
 * Used by scripts/templates-qa.ts; run alone with `npx tsx scripts/templates-fields.ts [--templates=a,b]`.
 */
import { FormType } from '../types.ts';
import { money, negMoney, formatDate } from '../utils/templates/format.ts';
import { renderDocument } from '../utils/templates/render.ts';
import type { DocKind, DocModel } from '../utils/templates/model.ts';
import { SAMPLE_LOGO, SAMPLE_SIGNATURE, SAMPLE_CLIENT_SIGNATURE } from '../utils/templates/sampleData.ts';

type Slot = 'company' | 'number' | 'status' | 'subject' | 'party' | 'meta' | 'fact' | 'section' | 'items' | 'totals' | 'tags' | 'signature' | 'url' | 'intro';

export interface FieldExpectation {
  /** form data key (for messages) */
  field: string;
  /** text that must be visible (or URL that must be in the HTML for slot 'url' / 'signature') */
  text: string;
  slot: Slot;
  /** label / title of the slot (party label, meta label, fact label, section title, total label, signature label) */
  label?: string;
  /** other labels this value may legitimately also appear under (e.g. the worker's name in the hours table) */
  alsoUnder?: string[];
}

export interface FieldCase {
  kind: DocKind;
  type: FormType;
  data: Record<string, any>;
  job: Record<string, any> | null;
  expect: FieldExpectation[];
  /** text that must NOT appear anywhere (private or foreign values) */
  absent?: Array<{ field: string; text: string }>;
}

const PROFILE = { id: 'p', email: 'office@profile-only.example', name: 'Profile Owner Q0', companyName: 'PROFILE-COMPANY-Q0', address: 'PROFILE-ADDR-Q0', phone: '555-0000', website: 'profile-only.example' };
/** The job's client is deliberately NOT the document's client: its address must never leak into a document for another client. */
const JOB = { id: 'j', userId: 'p', name: 'JOBNAME-Q9', clientName: 'JOBCLIENT-Q9', clientAddress: 'JOBCLIENT-ADDR-Q9', startDate: '2031-01-01', endDate: null, status: 'active' };

const fd = (iso: string) => formatDate(iso, { locale: 'en-US' });
const usd = (n: number) => money(n, { currency: 'USD' });

const company = {
  companyName: 'COMPANYNAME-Q1', companyAddress: 'COMPANYADDR-Q1 Line One\nCOMPANYADDR-Q1 Line Two', companyPhone: '555-0101-Q1', companyWebsite: 'companysite-q1.example', logoUrl: SAMPLE_LOGO,
};
const companyExpect: FieldExpectation[] = [
  { field: 'companyName', text: 'COMPANYNAME-Q1', slot: 'company' },
  { field: 'companyAddress', text: 'COMPANYADDR-Q1 Line One', slot: 'company' },
  { field: 'companyAddress', text: 'COMPANYADDR-Q1 Line Two', slot: 'company' },
  { field: 'companyPhone', text: '555-0101-Q1', slot: 'company' },
  { field: 'companyWebsite', text: 'companysite-q1.example', slot: 'company' },
  { field: 'logoUrl', text: SAMPLE_LOGO, slot: 'url' },
];
const client = (label: string) => ({
  data: { clientId: 'c1', clientName: 'CLIENTNAME-Q2', clientAddress: 'CLIENTADDR-Q2 Street\nCLIENTADDR-Q2 City' },
  expect: [
    { field: 'clientName', text: 'CLIENTNAME-Q2', slot: 'party', label },
    { field: 'clientAddress', text: 'CLIENTADDR-Q2 Street', slot: 'party', label },
    { field: 'clientAddress', text: 'CLIENTADDR-Q2 City', slot: 'party', label },
  ] as FieldExpectation[],
});
const sigExpect = (label: string): FieldExpectation => ({ field: 'signatureUrl', text: SAMPLE_SIGNATURE, slot: 'signature', label });
const title = (code: string): { data: Record<string, any>; expect: FieldExpectation[] } => ({
  data: { title: `CUSTOMTITLE-${code}` }, expect: [{ field: 'title', text: `CUSTOMTITLE-${code}`, slot: 'subject' }],
});
const noJobClient = [{ field: 'job.clientAddress', text: 'JOBCLIENT-ADDR-Q9' }];

const line = (n: number, qty: number, rate: number) => ({ id: `l${n}`, description: `LINEDESC-Q${n}`, quantity: qty, rate });

export const FIELD_CASES: FieldCase[] = [
  (() => {
    const c = client('Bill to');
    const t = title('INV');
    return {
      kind: 'invoice', type: FormType.Invoice, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        invoiceNumber: 'INVNO-Q3', status: 'Overdue', issueDate: '2031-01-11', dueDate: '2031-02-22',
        lineItems: [line(4, 3, 111.11)], discount: 12.34, taxRate: 8.25, shipping: 45.67, amountPaid: 100,
        paypalLink: 'https://pay.example.com/q5', recurrence: { enabled: true, frequency: 'Quarterly', nextRunDate: '2031-04-11' },
        notes: 'NOTES-Q6 for the client', signatureUrl: SAMPLE_SIGNATURE, templateId: 'classic',
        sourceEstimateId: 'est-1', sourceEstimateNumber: 'SRCEST-Q11',
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'invoiceNumber', text: 'INVNO-Q3', slot: 'number' },
        { field: 'status', text: 'Overdue', slot: 'status' },
        { field: 'issueDate', text: fd('2031-01-11'), slot: 'meta', label: 'Invoice date' },
        { field: 'dueDate', text: fd('2031-02-22'), slot: 'meta', label: 'Due date' },
        { field: 'job.name', text: 'JOBNAME-Q9', slot: 'meta', label: 'Project' },
        { field: 'recurrence', text: 'Recurring · Quarterly', slot: 'meta', label: 'Billing' },
        { field: 'lineItems[].description', text: 'LINEDESC-Q4', slot: 'items' },
        { field: 'lineItems[].rate', text: usd(111.11), slot: 'items' },
        { field: 'lineItems[] amount', text: usd(333.33), slot: 'items', alsoUnder: ['Subtotal'] },
        { field: 'discount', text: negMoney(12.34), slot: 'totals', label: 'Discount' },
        { field: 'taxRate', text: usd(26.48), slot: 'totals', label: 'Tax (8.25%)' },
        { field: 'shipping', text: usd(45.67), slot: 'totals', label: 'Shipping' },
        // 333.33 - 12.34 + 8.25% tax (26.48) + 45.67 = 393.14; deposit 100 -> balance 293.14
        { field: 'total', text: usd(393.14), slot: 'totals', label: 'Total' },
        { field: 'amountPaid (deposit)', text: negMoney(100), slot: 'totals', label: 'Amount paid' },
        { field: 'balance due', text: usd(293.14), slot: 'totals', label: 'Balance due', alsoUnder: ['Amount due'] },
        { field: 'sourceEstimateNumber (converted from an estimate)', text: 'SRCEST-Q11', slot: 'meta', label: 'From estimate' },
        { field: 'paypalLink', text: 'https://pay.example.com/q5', slot: 'url' },
        { field: 'notes', text: 'NOTES-Q6 for the client', slot: 'section', label: 'Notes' },
        sigExpect('Authorized signature'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const c = client('Prepared for');
    const t = title('EST');
    return {
      kind: 'estimate', type: FormType.Estimate, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        estimateNumber: 'ESTNO-Q3', status: 'Accepted', issueDate: '2031-03-03', expiryDate: '2031-04-14',
        lineItems: [{ ...line(4, 2, 250.5), unitCost: 9876.54 }], discount: 21.5, taxRate: 7.5,
        notes: 'NOTES-Q6 estimate', terms: 'TERMS-Q7 estimate', signatureUrl: SAMPLE_SIGNATURE,
        clientSignatureUrl: SAMPLE_CLIENT_SIGNATURE, clientSignedAt: '2031-03-05T10:30:00', clientSignedBy: 'SIGNEDBY-Q8',
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'estimateNumber', text: 'ESTNO-Q3', slot: 'number' },
        { field: 'status', text: 'Accepted', slot: 'status' },
        { field: 'issueDate', text: fd('2031-03-03'), slot: 'meta', label: 'Estimate date' },
        { field: 'expiryDate', text: fd('2031-04-14'), slot: 'meta', label: 'Valid until' },
        { field: 'lineItems[].description', text: 'LINEDESC-Q4', slot: 'items' },
        // 501.00 - 21.50 = 479.50; tax 7.5% = 35.96 (35.9625); total 515.46
        { field: 'discount', text: negMoney(21.5), slot: 'totals', label: 'Discount' },
        { field: 'taxRate', text: usd(35.96), slot: 'totals', label: 'Tax (7.5%)' },
        { field: 'estimate total (with tax and discount)', text: usd(515.46), slot: 'totals', label: 'Estimate total' },
        { field: 'notes', text: 'NOTES-Q6 estimate', slot: 'section', label: 'Notes' },
        { field: 'terms', text: 'TERMS-Q7 estimate', slot: 'section', label: 'Terms & conditions' },
        sigExpect('Authorized signature'),
        { field: 'clientSignatureUrl', text: SAMPLE_CLIENT_SIGNATURE, slot: 'signature', label: 'Client acceptance' },
        { field: 'clientSignedBy', text: 'SIGNEDBY-Q8', slot: 'signature', label: 'Client acceptance' },
      ],
      absent: [...noJobClient, { field: 'lineItems[].unitCost (private "Your cost")', text: '9,876.54' }],
    } as FieldCase;
  })(),
  (() => {
    const c = client('Customer / service location');
    const t = title('WO');
    return {
      kind: 'workOrder', type: FormType.WorkOrder, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        workOrderNumber: 'WONO-Q3', status: 'On Hold', date: '2031-05-05', assignedTo: 'ASSIGNEE-Q8',
        description: 'SCOPE-Q4 replace the unit', materialsUsed: 'MATERIALS-Q5 copper', hours: 7.25, cost: 4321.09,
        terms: 'TERMS-Q7 work order', signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'workOrderNumber', text: 'WONO-Q3', slot: 'number' },
        { field: 'status', text: 'On Hold', slot: 'status' },
        { field: 'date', text: fd('2031-05-05'), slot: 'meta', label: 'Date' },
        { field: 'assignedTo', text: 'ASSIGNEE-Q8', slot: 'meta', label: 'Assigned to' },
        { field: 'description', text: 'SCOPE-Q4 replace the unit', slot: 'section', label: 'Scope of work' },
        { field: 'materialsUsed', text: 'MATERIALS-Q5 copper', slot: 'section', label: 'Materials used' },
        { field: 'hours', text: '7.25 h', slot: 'fact', label: 'Labor hours' },
        { field: 'cost', text: usd(4321.09), slot: 'fact', label: 'Estimated cost' },
        { field: 'terms', text: 'TERMS-Q7 work order', slot: 'section', label: 'Terms' },
        sigExpect('Authorized signature'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const t = title('DR');
    return {
      kind: 'dailyReport', type: FormType.DailyJobReport, job: JOB,
      data: {
        ...company, ...t.data,
        reportNumber: 'DRNO-Q3', date: '2031-06-06', weather: 'WEATHER-Q4', temperature: '61F-Q4', crewSize: 13, laborHours: 52.5,
        clientId: 'c1', clientName: 'CLIENTNAME-Q2', projectAddress: 'PROJADDR-Q5 Site Rd', projectName: 'PROJNAME-Q5',
        content: '<h3>Work completed</h3><p>CONTENT-Q6 framed the wall</p>', tags: ['TAG-Q7A', 'TAG-Q7B'], signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...t.expect,
        { field: 'reportNumber', text: 'DRNO-Q3', slot: 'number' },
        { field: 'date', text: fd('2031-06-06'), slot: 'fact', label: 'Date' },
        { field: 'weather', text: 'WEATHER-Q4', slot: 'fact', label: 'Weather' },
        { field: 'temperature', text: '61F-Q4', slot: 'fact', label: 'Temperature' },
        { field: 'crewSize', text: '13', slot: 'fact', label: 'Crew on site' },
        { field: 'laborHours', text: '52.5 h', slot: 'fact', label: 'Labor hours' },
        { field: 'clientName', text: 'CLIENTNAME-Q2', slot: 'party', label: 'Client' },
        { field: 'projectName', text: 'PROJNAME-Q5', slot: 'party', label: 'Project' },
        { field: 'projectAddress', text: 'PROJADDR-Q5 Site Rd', slot: 'party', label: 'Project' },
        { field: 'content', text: 'CONTENT-Q6 framed the wall', slot: 'section', label: '' },
        { field: 'tags', text: 'TAG-Q7A', slot: 'tags' },
        { field: 'tags', text: 'TAG-Q7B', slot: 'tags' },
        sigExpect('Site supervisor'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const c = client('Job / client');
    const t = title('TS');
    return {
      kind: 'timeSheet', type: FormType.TimeSheet, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        workerName: 'WORKER-Q3', date: '2031-07-07', hoursWorked: 7.75, overtimeHours: 1.25, status: 'Approved',
        notes: 'NOTES-Q6 poured footings', signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'workerName', text: 'WORKER-Q3', slot: 'party', label: 'Worker' },
        { field: 'date', text: fd('2031-07-07'), slot: 'meta', label: 'Date' },
        { field: 'hoursWorked', text: '7.75', slot: 'fact', label: 'Regular hours', alsoUnder: ['Regular'] },
        { field: 'overtimeHours', text: '1.25', slot: 'fact', label: 'Overtime hours', alsoUnder: ['Overtime'] },
        { field: 'status', text: 'Approved', slot: 'status' },
        { field: 'notes', text: 'NOTES-Q6 poured footings', slot: 'section', label: 'Notes' },
        sigExpect('Signature'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const c = client('Client');
    const t = title('ML');
    return {
      kind: 'materialLog', type: FormType.MaterialLog, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        projectName: 'PROJNAME-Q5', date: '2031-08-08',
        items: [{ id: 'm1', name: 'MATERIAL-Q4', supplier: 'SUPPLIER-Q4', quantity: 6, unitCost: 12.75 }],
        signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'projectName', text: 'PROJNAME-Q5', slot: 'party', label: 'Project' },
        { field: 'date', text: fd('2031-08-08'), slot: 'meta', label: 'Date' },
        { field: 'items[].name', text: 'MATERIAL-Q4', slot: 'items' },
        { field: 'items[].supplier', text: 'SUPPLIER-Q4', slot: 'items' },
        { field: 'items[].unitCost', text: usd(12.75), slot: 'items' },
        sigExpect('Received / verified by'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const t = title('EXP');
    return {
      kind: 'expenseLog', type: FormType.ExpenseLog, job: JOB,
      data: {
        ...company, ...t.data,
        vendor: 'VENDOR-Q3', date: '2031-09-09', category: 'Fuel', lineItems: [line(4, 2, 40)], tax: 6.4,
        // "Total paid" typed by the user: items + tax would be 86.40
        amount: 90, notes: 'NOTES-Q6 receipt', clientId: 'c1', clientName: 'CLIENTNAME-Q2', signatureUrl: SAMPLE_SIGNATURE, item: '',
      },
      expect: [
        ...companyExpect, ...t.expect,
        { field: 'vendor', text: 'VENDOR-Q3', slot: 'party', label: 'Vendor / store' },
        { field: 'date', text: fd('2031-09-09'), slot: 'meta', label: 'Date' },
        { field: 'category', text: 'Fuel', slot: 'meta', label: 'Category' },
        { field: 'lineItems[].description', text: 'LINEDESC-Q4', slot: 'items' },
        { field: 'tax', text: usd(6.4), slot: 'totals', label: 'Tax paid' },
        { field: 'amount', text: usd(90), slot: 'totals', label: 'Total paid' },
        { field: 'notes', text: 'NOTES-Q6 receipt', slot: 'section', label: 'Notes' },
        { field: 'clientName', text: 'CLIENTNAME-Q2', slot: 'party', label: 'Job / client' },
        sigExpect('Approved by'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const t = title('WAR');
    return {
      kind: 'warranty', type: FormType.Warranty, job: JOB,
      data: {
        ...t.data, logoUrl: SAMPLE_LOGO,
        warrantyNumber: 'WARNO-Q3', completedDate: '2031-10-10', duration: '2 years',
        clientId: 'c1', clientName: 'CLIENTNAME-Q2', projectAddress: 'PROPADDR-Q5 Lane',
        coverage: 'COVERAGE-Q6 roof membrane', conditions: 'CONDITIONS-Q7 excludes storms', signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...t.expect,
        { field: 'profile.companyName', text: 'PROFILE-COMPANY-Q0', slot: 'company' },
        { field: 'logoUrl', text: SAMPLE_LOGO, slot: 'url' },
        { field: 'warrantyNumber', text: 'WARNO-Q3', slot: 'number' },
        { field: 'completedDate', text: fd('2031-10-10'), slot: 'fact', label: 'Effective from', alsoUnder: ['This certifies'] },
        { field: 'duration', text: '2 years', slot: 'fact', label: 'Warranty period', alsoUnder: ['This certifies'] },
        { field: 'clientName', text: 'CLIENTNAME-Q2', slot: 'party', label: 'Issued to', alsoUnder: ['This certifies'] },
        { field: 'projectAddress', text: 'PROPADDR-Q5 Lane', slot: 'party', label: 'Issued to', alsoUnder: ['This certifies'] },
        { field: 'coverage', text: 'COVERAGE-Q6 roof membrane', slot: 'section', label: 'Coverage' },
        { field: 'conditions', text: 'CONDITIONS-Q7 excludes storms', slot: 'section', label: 'Conditions & exclusions' },
        sigExpect('Authorized signature'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  {
    kind: 'note', type: FormType.Note, job: JOB,
    data: { title: 'NOTETITLE-Q3', content: '<p>NOTECONTENT-Q4 call the inspector</p>', tags: ['TAG-Q5'] },
    expect: [
      { field: 'title', text: 'NOTETITLE-Q3', slot: 'subject' },
      { field: 'content', text: 'NOTECONTENT-Q4 call the inspector', slot: 'section', label: '' },
      { field: 'tags', text: 'TAG-Q5', slot: 'tags' },
    ],
  },
  (() => {
    const c = client('Received from');
    const t = title('REC');
    return {
      kind: 'receipt', type: FormType.Receipt, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        receiptNumber: 'RECNO-Q3', date: '2031-11-11', amount: 777.77, paymentMethod: 'PAYMETHOD-Q4', description: 'FOR-Q5 deposit',
        invoiceId: 'inv-1', invoiceNumber: 'FORINV-Q6',
        signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...c.expect.map((e) => ({ ...e, alsoUnder: ['Received from'] })), ...t.expect,
        { field: 'receiptNumber', text: 'RECNO-Q3', slot: 'number' },
        { field: 'date', text: fd('2031-11-11'), slot: 'meta', label: 'Date received', alsoUnder: ['Received from'] },
        { field: 'paymentMethod', text: 'PAYMETHOD-Q4', slot: 'meta', label: 'Payment method', alsoUnder: ['Received from'] },
        { field: 'description', text: 'FOR-Q5 deposit', slot: 'items' },
        { field: 'invoiceNumber ("For invoice" picker)', text: '#FORINV-Q6', slot: 'meta', label: 'For invoice', alsoUnder: ['Received from'] },
        { field: 'amount', text: usd(777.77), slot: 'totals', label: 'Total received', alsoUnder: ['Amount received', 'Received from', 'Amount'] },
        sigExpect('Received by'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const c = client('Owner / client');
    const t = title('CO');
    return {
      kind: 'changeOrder', type: FormType.ChangeOrder, job: JOB,
      data: {
        ...company, ...c.data, ...t.data,
        changeOrderNumber: 'CONO-Q3', status: 'Accepted', date: '2031-12-12', reason: 'REASON-Q4 client request', description: 'CHANGEDESC-Q5 add outlet',
        currentContractSum: 25000, lineItems: [line(6, 1, 1500)], terms: 'TERMS-Q7 change',
        signatureUrl: SAMPLE_SIGNATURE, clientSignatureUrl: SAMPLE_CLIENT_SIGNATURE, clientSignedAt: '2031-12-13T09:00:00', clientSignedBy: 'SIGNEDBY-Q8',
      },
      expect: [
        ...companyExpect, ...c.expect, ...t.expect,
        { field: 'changeOrderNumber', text: 'CONO-Q3', slot: 'number' },
        { field: 'status (Accepted by the approval link -> Approved)', text: 'Approved', slot: 'status' },
        { field: 'date', text: fd('2031-12-12'), slot: 'meta', label: 'Date' },
        { field: 'reason', text: 'REASON-Q4 client request', slot: 'meta', label: 'Reason' },
        { field: 'description', text: 'CHANGEDESC-Q5 add outlet', slot: 'section', label: 'Description of change' },
        { field: 'currentContractSum', text: usd(25000), slot: 'totals', label: 'Current contract value' },
        { field: 'lineItems[].description', text: 'LINEDESC-Q6', slot: 'items' },
        { field: 'new contract total', text: usd(26500), slot: 'totals', label: 'New contract total' },
        { field: 'terms', text: 'TERMS-Q7 change', slot: 'section', label: 'Terms' },
        sigExpect('Authorized signature'),
        { field: 'clientSignatureUrl', text: SAMPLE_CLIENT_SIGNATURE, slot: 'signature', label: 'Owner / client approval' },
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  (() => {
    const t = title('PO');
    return {
      kind: 'purchaseOrder', type: FormType.PurchaseOrder, job: JOB,
      data: {
        ...company, ...t.data,
        poNumber: 'PONO-Q3', status: 'Received', date: '2032-01-13', deliveryDate: '2032-02-14',
        vendorName: 'VENDORNAME-Q4', vendorEmail: 'vendor-q4@example.com', vendorPhone: '555-0404-Q4', vendorAddress: 'VENDORADDR-Q4 Mill Rd',
        shipToType: 'Custom', shipToName: 'SHIPNAME-Q5', shipToPhone: '555-0505-Q5', shipToAddress: 'SHIPADDR-Q5 Yard 2',
        deliveryInstructions: 'DELIVERY-Q6 gate code', lineItems: [line(7, 4, 19.95)], notes: 'NOTES-Q8 vendor', signatureUrl: SAMPLE_SIGNATURE,
      },
      expect: [
        ...companyExpect, ...t.expect,
        { field: 'poNumber', text: 'PONO-Q3', slot: 'number' },
        { field: 'status', text: 'Received', slot: 'status' },
        { field: 'date', text: fd('2032-01-13'), slot: 'meta', label: 'Order date' },
        { field: 'deliveryDate', text: fd('2032-02-14'), slot: 'meta', label: 'Required by' },
        { field: 'vendorName', text: 'VENDORNAME-Q4', slot: 'party', label: 'Vendor' },
        { field: 'vendorEmail', text: 'vendor-q4@example.com', slot: 'party', label: 'Vendor' },
        { field: 'vendorPhone', text: '555-0404-Q4', slot: 'party', label: 'Vendor' },
        { field: 'vendorAddress', text: 'VENDORADDR-Q4 Mill Rd', slot: 'party', label: 'Vendor' },
        { field: 'shipToName', text: 'SHIPNAME-Q5', slot: 'party', label: 'Ship to · Custom' },
        { field: 'shipToPhone', text: '555-0505-Q5', slot: 'party', label: 'Ship to · Custom' },
        { field: 'shipToAddress', text: 'SHIPADDR-Q5 Yard 2', slot: 'party', label: 'Ship to · Custom' },
        { field: 'deliveryInstructions', text: 'DELIVERY-Q6 gate code', slot: 'section', label: 'Delivery instructions' },
        { field: 'lineItems[].description', text: 'LINEDESC-Q7', slot: 'items' },
        { field: 'notes', text: 'NOTES-Q8 vendor', slot: 'section', label: 'Notes to vendor' },
        sigExpect('Authorized signature'),
      ],
      absent: noJobClient,
    } as FieldCase;
  })(),
  {
    kind: 'profitReport', type: FormType.ProfitReport, job: { id: 'j', userId: 'p', name: 'CALCNAME-Q2', clientName: '', status: 'active' },
    data: {
      title: 'CALCNAME-Q2', reportNumber: 'PC-Q3', date: '2032-03-15',
      items: [{ id: 'i1', description: 'PROFITITEM-Q4', cost: 100, charge: 160 }], vatEnabled: true, vatRate: 10, notes: 'NOTES-Q6 summary',
    },
    expect: [
      { field: 'reportNumber', text: 'PC-Q3', slot: 'number' },
      { field: 'date', text: fd('2032-03-15'), slot: 'meta', label: 'Date' },
      { field: 'title', text: 'CALCNAME-Q2', slot: 'subject', alsoUnder: ['Project'] },
      { field: 'items[].description', text: 'PROFITITEM-Q4', slot: 'items' },
      { field: 'vatRate', text: usd(16), slot: 'totals', label: 'VAT (10%)' },
      { field: 'notes', text: 'NOTES-Q6 summary', slot: 'section', label: 'Notes' },
    ],
  },
];

// Variants: other states of the same forms (progress billing, ship to the job site, totals typed by hand,
// unsigned time sheet, a receipt saved by an older version).
FIELD_CASES.push(
  {
    kind: 'invoice', type: FormType.Invoice, job: JOB,
    data: {
      ...company, clientName: 'CLIENTNAME-Q2', clientAddress: 'CLIENTADDR-Q2 Street', invoiceNumber: 'INVNO-P3', issueDate: '2031-01-11', isProgressBilling: true,
      lineItems: [{ id: 'p1', description: 'PHASEDESC-P4', quantity: 1, rate: 20000, percentComplete: 40, previouslyBilled: 3000 }],
    },
    expect: [
      { field: 'lineItems[].description (progress)', text: 'PHASEDESC-P4', slot: 'items' },
      { field: 'lineItems[] scheduled value', text: usd(20000), slot: 'items', alsoUnder: ['Progress billing summary', 'Total contract value'] },
      { field: 'lineItems[].percentComplete', text: '40%', slot: 'items' },
      { field: 'lineItems[].previouslyBilled', text: usd(3000), slot: 'items', alsoUnder: ['Previously billed'] },
      { field: 'progress amount (this period)', text: usd(5000), slot: 'totals', label: 'Total', alsoUnder: ['This period', 'Subtotal', 'This invoice', 'Amount due', 'Progress billing summary'] },
      { field: 'progress summary', text: 'Total contract value', slot: 'section', label: 'Progress billing summary' },
    ],
    absent: noJobClient,
  },
  {
    // half-up rounding (QA 0b.18): 50% of $99.99 = 49.995, minus $20 billed before = $30.00 (not $29.99)
    kind: 'invoice', type: FormType.Invoice, job: JOB,
    data: {
      ...company, clientName: 'CLIENTNAME-Q2', clientAddress: 'CLIENTADDR-Q2 Street', invoiceNumber: 'INVNO-R3', issueDate: '2031-01-11', isProgressBilling: true,
      lineItems: [{ id: 'r1', description: 'PHASEDESC-R4', quantity: 1, rate: 99.99, percentComplete: 50, previouslyBilled: 20 }],
    },
    expect: [
      { field: 'progress amount rounded half-up', text: usd(30), slot: 'totals', label: 'Total', alsoUnder: ['This period', 'Subtotal', 'This invoice', 'Amount due', 'Progress billing summary'] },
    ],
    absent: [...noJobClient, { field: 'progress amount rounded down', text: usd(29.99) }],
  },
  {
    // a change order with a credit line and a status that is not printed (Draft / Sent)
    kind: 'changeOrder', type: FormType.ChangeOrder, job: JOB,
    data: { ...company, clientName: 'CLIENTNAME-Q2', changeOrderNumber: 'CONO-P3', status: 'Sent', currentContractSum: 1000, lineItems: [line(9, 1, -250)] },
    expect: [
      { field: 'currentContractSum', text: usd(1000), slot: 'totals', label: 'Current contract value' },
      { field: 'new contract total after a credit', text: usd(750), slot: 'totals', label: 'New contract total' },
    ],
    absent: noJobClient,
  },
  {
    kind: 'purchaseOrder', type: FormType.PurchaseOrder, job: JOB,
    data: { ...company, poNumber: 'PONO-P3', vendorName: 'VENDORNAME-P4', shipToType: 'Job Site', shipToName: 'JOBSITE-P5', shipToAddress: 'JOBSITE-ADDR-P5', lineItems: [line(8, 1, 10)] },
    expect: [
      { field: 'vendorName', text: 'VENDORNAME-P4', slot: 'party', label: 'Vendor' },
      { field: 'shipToName (Job Site)', text: 'JOBSITE-P5', slot: 'party', label: 'Ship to · Job Site' },
      { field: 'shipToAddress (Job Site)', text: 'JOBSITE-ADDR-P5', slot: 'party', label: 'Ship to · Job Site' },
    ],
    absent: noJobClient,
  },
  {
    kind: 'expenseLog', type: FormType.ExpenseLog, job: JOB,
    data: { ...company, vendor: 'VENDOR-P3', date: '2031-09-10', category: 'Material', amount: 123.45, tax: 0, lineItems: [], item: 'OLDEXPENSE-P4 lumber', notes: '' },
    expect: [
      { field: 'amount (no items)', text: usd(123.45), slot: 'totals', label: 'Total paid', alsoUnder: ['Amount', 'Subtotal'] },
      { field: 'item (old expense logs)', text: 'OLDEXPENSE-P4 lumber', slot: 'items' },
    ],
    absent: noJobClient,
  },
  {
    kind: 'timeSheet', type: FormType.TimeSheet, job: JOB,
    data: { ...company, workerName: 'WORKER-P3', date: '2031-07-08', hoursWorked: 8, overtimeHours: 0 },
    expect: [
      { field: 'workerName', text: 'WORKER-P3', slot: 'party', label: 'Worker' },
      { field: 'blank worker signature line', text: '', slot: 'signature', label: 'Worker signature' },
      { field: 'blank supervisor line', text: '', slot: 'signature', label: 'Supervisor approval' },
    ],
  },
  {
    kind: 'receipt', type: FormType.Receipt, job: JOB,
    data: { ...company, receiptNumber: 'RECNO-P3', from: 'OLDPAYER-P4', amount: 50, date: '2031-11-12' },
    expect: [{ field: 'from (older receipts)', text: 'OLDPAYER-P4', slot: 'party', label: 'Received from', alsoUnder: ['This certifies'] }],
    absent: noJobClient,
  },
);

// ---------------------------------------------------------------------------
// HTML → blocks of visible text (tiny tolerant tokenizer; the renderer emits well-formed markup)
// ---------------------------------------------------------------------------
const VOID = new Set(['img', 'br', 'hr', 'col', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track']);
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
export const norm = (s: string) => decode(s).toLowerCase().replace(/\s+/g, ' ').trim();

interface Segment { id: string; text: string; html: string }

/** Splits the rendered document into its top-level blocks (.cd-block), the page chrome and the footer. */
export const segmentsOf = (html: string): Segment[] => {
  const segs = new Map<string, { text: string[]; html: string[] }>();
  const stack: Array<{ tag: string; seg: string | null; skip: boolean }> = [];
  let blockN = 0;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const cur = () => (stack.length ? stack[stack.length - 1] : { tag: '', seg: null, skip: false });
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [, close, tagRaw, attrs, selfClose, text] = m;
    if (text !== undefined) {
      const c = cur();
      if (c.seg && !c.skip) {
        const s = segs.get(c.seg)!;
        s.text.push(text);
        s.html.push(text);
      }
      continue;
    }
    const tag = tagRaw.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      const c = cur();
      if (c.seg) segs.get(c.seg)!.html.push(m[0]);
      continue;
    }
    const parent = cur();
    const cls = (/\bclass\s*=\s*"([^"]*)"/.exec(attrs || '') || [])[1] || '';
    let seg = parent.seg;
    let skip = parent.skip || tag === 'style' || tag === 'script' || tag === 'title';
    if (/\bcd-runhead\b/.test(cls)) skip = true;
    if (!parent.seg || parent.seg === 'page') {
      if (/\bcd-block\b/.test(cls)) seg = `block${++blockN}:${cls.replace(/\bcd-block\b/, '').trim().split(/\s+/)[0] || 'block'}`;
      else if (/\bcd-chrome\b/.test(cls)) seg = 'chrome';
      else if (/\bcd-footer\b/.test(cls)) seg = 'footer';
      else if (/\bcd-page\b/.test(cls)) seg = 'page';
    }
    if (seg && !segs.has(seg)) segs.set(seg, { text: [], html: [] });
    if (seg) segs.get(seg)!.html.push(m[0]);
    if (tag === 'br' && seg) segs.get(seg)!.text.push(' ');
    if (!VOID.has(tag) && !selfClose) stack.push({ tag, seg, skip });
  }
  return Array.from(segs.entries()).map(([id, v]) => ({ id, text: norm(v.text.join(' ')), html: v.html.join('') }));
};

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (s: string) => new RegExp(`(^|[^a-z0-9])${escRe(norm(s))}(?=$|[^a-z0-9])`, 'g');

const occurrences = (text: string, needle: string): number[] => {
  const out: number[] = [];
  const n = norm(needle);
  if (!n) return out;
  let i = text.indexOf(n);
  while (i !== -1) { out.push(i); i = text.indexOf(n, i + n.length); }
  return out;
};

/** The label (from `labels`) that ends closest before position `pos` in `text`; longest wins on ties. */
const nearestLabel = (text: string, pos: number, labels: string[]): string | null => {
  let best: { label: string; end: number } | null = null;
  for (const label of labels) {
    if (!norm(label)) continue;
    const re = wordRe(label);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (end > pos) break;
      if (!best || end > best.end || (end === best.end && norm(label).length > norm(best.label).length)) best = { label, end };
    }
  }
  return best ? best.label : null;
};

const modelLabels = (m: DocModel): string[] => Array.from(new Set([
  ...m.parties.map((p) => p.label), ...m.meta.map((i) => i.label), ...m.facts.map((f) => f.label),
  ...[...m.before, ...m.after, ...m.summaryNotes].map((s) => s.title), ...m.totals.map((t) => t.label),
  ...m.signatures.map((s) => s.label), ...(m.items?.columns.map((c) => c.label) || []),
  m.keyDate?.label || '', m.highlight?.label || '', m.numberLabel,
].map((l) => decode(l)).filter(Boolean)));

/** Every printable string of the model with the slot it belongs to. */
const modelSlots = (m: DocModel): Array<{ slot: string; label: string; text: string; emphasis?: boolean }> => [
  { slot: 'company', label: '', text: [m.company.name, ...m.company.lines, m.company.tagline].join(' \n ') },
  { slot: 'number', label: m.numberLabel, text: m.number },
  { slot: 'status', label: '', text: m.status?.text || '' },
  { slot: 'subject', label: '', text: m.subject },
  { slot: 'intro', label: 'This certifies', text: m.intro.replace(/<[^>]+>/g, '') },
  ...m.parties.map((p) => ({ slot: 'party', label: p.label, text: [p.name, ...p.lines].join(' \n ') })),
  ...m.meta.map((i) => ({ slot: 'meta', label: i.label, text: i.value })),
  ...m.facts.map((f) => ({ slot: 'fact', label: f.label, text: `${f.value} ${f.sub || ''}` })),
  ...[...m.before, ...m.after, ...m.summaryNotes].map((s) => ({ slot: 'section', label: s.title, text: s.html.replace(/<[^>]+>/g, ' ') })),
  { slot: 'items', label: '', text: (m.items?.rows || []).map((r) => r.join(' | ')).join(' \n ').replace(/<[^>]+>/g, ' ') },
  ...m.totals.map((t) => ({ slot: 'totals', label: t.label, text: `${t.label} ${t.value}` })),
  ...m.signatures.map((s) => ({ slot: 'signature', label: s.label, text: `${s.name} ${s.date}` })),
  { slot: 'tags', label: '', text: m.tags.join(' \n ') },
  { slot: 'closing', label: '', text: m.closing },
  { slot: 'keyDate', label: m.keyDate?.label || '', text: m.keyDate?.value || '', emphasis: true },
  { slot: 'highlight', label: m.highlight?.label || '', text: m.highlight?.value || '', emphasis: true },
  { slot: 'footer', label: '', text: m.footerLine, emphasis: true },
];

const countIn = (text: string, needle: string) => occurrences(norm(text.replace(/<[^>]+>/g, ' ')), needle).length;

type CheckFn = (ok: unknown, msg: string) => void;

/** Template-independent: every sentinel lands in its slot, and in no other labelled slot. */
export const modelFieldChecks = (check: CheckFn) => {
  for (const c of FIELD_CASES) {
    const r = renderDocument(c.type, c.data, PROFILE, c.job, { templateId: 'classic', noFontLink: true });
    const m = r.model;
    const slots = modelSlots(m);
    for (const e of c.expect) {
      const tag = `[fields/model ${c.kind}] ${e.field}`;
      if (e.slot === 'url') { check(r.html.includes(e.text), `${tag}: URL missing from the document`); continue; }
      if (e.slot === 'signature') {
        const s = m.signatures.find((x) => decode(x.label) === e.label);
        const ok = s && (e.text ? s.imageUrl === e.text || decode(s.name).includes(e.text) : !s.imageUrl);
        check(ok, `${tag}: expected in signature "${e.label}" (signatures: ${m.signatures.map((x) => `${x.label}=${x.imageUrl ? 'img' : ''}${x.name}`).join(', ')})`);
        continue;
      }
      const inSlot = slots.filter((s) => s.slot === e.slot && (e.label === undefined || decode(s.label) === e.label) && countIn(s.text, e.text) > 0);
      check(inSlot.length > 0, `${tag}: "${e.text}" expected in ${e.slot}${e.label !== undefined ? ` "${e.label}"` : ''} but it is in: ${slots.filter((s) => countIn(s.text, e.text) > 0).map((s) => `${s.slot} "${decode(s.label)}"`).join(', ') || 'nowhere'}`);
      if (e.slot === 'status') check(!m.meta.some((i) => countIn(i.value, e.text) > 0), `${tag}: status "${e.text}" is shown by the status badge and must not be repeated in the details`);
      // no swaps / duplicates: no other labelled slot holds the value
      if (['party', 'meta', 'fact', 'section', 'totals'].includes(e.slot)) {
        const allowed = new Set([e.label, ...(e.alsoUnder || [])]);
        const elsewhere = slots.filter((s) => !s.emphasis && ['party', 'meta', 'fact', 'section', 'totals', 'number', 'subject'].includes(s.slot)
          && !(s.slot === e.slot && decode(s.label) === e.label) && !allowed.has(decode(s.label)) && countIn(s.text, e.text) > 0);
        check(!elsewhere.length, `${tag}: "${e.text}" is also printed under ${elsewhere.map((s) => `${s.slot} "${decode(s.label)}"`).join(', ')}`);
      }
    }
    for (const a of c.absent || []) check(!norm(r.html).includes(norm(a.text)), `[fields/model ${c.kind}] ${a.field} must not appear ("${a.text}")`);
  }
};

/** Every template: each sentinel visible, under its own label, not printed more often than the model holds it. */
export const renderFieldChecks = (templates: string[], check: CheckFn) => {
  for (const c of FIELD_CASES) {
    for (const templateId of templates) {
      const r = renderDocument(c.type, { ...c.data, templateId }, PROFILE, c.job, { templateId, noFontLink: true });
      const m = r.model;
      const segs = segmentsOf(r.html);
      const labels = [...modelLabels(m), 'This certifies'];
      const slots = modelSlots(m);
      for (const e of c.expect) {
        const tag = `[fields ${templateId}/${c.kind}] ${e.field}`;
        if (e.slot === 'url') { check(r.html.includes(e.text), `${tag}: URL missing`); continue; }
        if (e.slot === 'signature') {
          if (e.text.startsWith('data:') || e.text.startsWith('http')) {
            const seg = segs.find((s) => s.html.includes(e.text));
            check(seg, `${tag}: signature image missing`);
            if (seg && e.label) check(occurrences(seg.text, e.label).length > 0, `${tag}: signature image not under its label "${e.label}" (block ${seg.id})`);
          } else if (e.text) {
            check(segs.some((s) => occurrences(s.text, e.text).length > 0), `${tag}: signer name "${e.text}" missing`);
          } else if (e.label) {
            check(segs.some((s) => occurrences(s.text, e.label!).length > 0), `${tag}: signature line "${e.label}" missing`);
          }
          continue;
        }
        const hits = segs.flatMap((s) => occurrences(s.text, e.text).map((pos) => ({ seg: s, pos })));
        check(hits.length > 0, `${tag}: "${e.text}" is not printed`);
        if (!hits.length) continue;
        // not printed more often than the model holds it (emphasis copies and the footer included). The company's own
        // identity (letterhead, contact band, footer) and the document's number/title in a page footer or title block
        // (running identification) may repeat.
        const max = slots.reduce((a, s) => a + countIn(s.text, e.text), 0);
        const counted = e.slot === 'company' ? [] : hits.filter((h) => !(['number', 'subject'].includes(e.slot) && (h.seg.id === 'footer' || h.seg.id === 'chrome')));
        check(counted.length <= Math.max(1, max), `${tag}: "${e.text}" printed ${counted.length}× (model holds it ${max}×): ${counted.map((h) => h.seg.id).join(', ')}`);
        if (!e.label || !['party', 'meta', 'fact', 'section', 'totals'].includes(e.slot)) continue;
        // a value may sit under any label the MODEL gives it (the model-level check already proves those are right):
        // its own label, emphasis copies (key date / highlight), a signature's date line, the hours-table columns …
        const modelLabelsOfValue = slots.filter((s) => countIn(s.text, e.text) > 0).flatMap((s) => (s.slot === 'items' ? (m.items?.columns || []).map((col) => col.label) : [s.label]));
        const allowed = new Set([e.label, ...(e.alsoUnder || []), m.keyDate?.label || '', m.highlight?.label || '', ...modelLabelsOfValue].filter(Boolean).map((l) => norm(l)));
        let underOwn = 0;
        for (const h of hits) {
          if (h.seg.id === 'footer' && slots.some((s) => s.slot === 'footer' && countIn(s.text, e.text) > 0)) continue;
          const near = nearestLabel(h.seg.text, h.pos, labels);
          if (near && allowed.has(norm(near))) { underOwn++; continue; }
          check(false, `${tag}: "${e.text}" appears under "${near ?? '(no label)'}" instead of "${e.label}" (block ${h.seg.id}): …${h.seg.text.slice(Math.max(0, h.pos - 70), h.pos + e.text.length + 10)}…`);
        }
        if (e.label) check(underOwn > 0, `${tag}: "${e.text}" never appears under its label "${e.label}"`);
      }
      for (const a of c.absent || []) check(!norm(r.html).includes(norm(a.text)), `[fields ${templateId}/${c.kind}] ${a.field} must not appear ("${a.text}")`);
    }
  }
};

// standalone
if (process.argv[1] && /templates-fields\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  (async () => {
    const { TEMPLATES } = await import('../utils/templates/registry.ts');
    const only = process.argv.find((a) => a.startsWith('--templates='))?.split('=')[1]?.split(',').filter(Boolean);
    const ids = TEMPLATES.map((t) => t.id as string).filter((id) => !only || only.includes(id));
    const failures: string[] = [];
    let n = 0;
    const check: CheckFn = (ok, msg) => { n++; if (!ok) failures.push(msg); };
    modelFieldChecks(check);
    renderFieldChecks(ids, check);
    for (const f of failures.slice(0, 150)) console.log(`FAIL  ${f}`);
    if (failures.length > 150) console.log(`… and ${failures.length - 150} more`);
    console.log(`${failures.length ? 'FAILED' : 'PASSED'}: ${n} field checks, ${failures.length} failures (${ids.length} templates)`);
    process.exit(failures.length ? 1 : 0);
  })();
}
