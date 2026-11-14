/**
 * Field registry for the 12 document types. Field names are EXACTLY the names in types.ts.
 * It drives the AI prefill merge (hooks/useDocumentDraftPrefill.ts) and the QA script
 * (scripts/forms-prefill-qa.ts), and every field listed here has a visible input in its form.
 */
import { FormType } from '../../types.ts';

export type FieldKind =
    | 'text'        // single-line plain text
    | 'multiline'   // plain text with line breaks (HTML from the AI is converted to text)
    | 'rich'        // sanitized HTML (Daily Report / Note body)
    | 'number'      // non-negative number (hours)
    | 'money'       // non-negative amount, rounded to cents
    | 'percent'     // 0-100
    | 'date'        // local YYYY-MM-DD
    | 'bool'
    | 'enum'
    | 'lineItems'   // LineItem[]
    | 'materialItems' // MaterialLogItem[]
    | 'colors'      // { primary, secondary }
    | 'url'         // payment link
    | 'image'       // logo / signature (https or base64 raster data URI)
    | 'template'    // template id or a style description
    | 'visual'      // ai_visual_data object
    | 'tags'        // string[]
    | 'recurrence'  // invoice recurrence object
    | 'estimateOptions'; // good / better / best OptionSet (lib/estimateOptions.ts), Estimate only

export interface FieldSpec {
    kind: FieldKind;
    options?: readonly string[];
}

export type DocumentFormType = Exclude<FormType, FormType.ProfitReport>;

export const DOCUMENT_FORM_TYPES: DocumentFormType[] = [
    FormType.Invoice, FormType.Estimate, FormType.WorkOrder, FormType.DailyJobReport,
    FormType.TimeSheet, FormType.MaterialLog, FormType.ExpenseLog, FormType.Warranty,
    FormType.Note, FormType.Receipt, FormType.ChangeOrder, FormType.PurchaseOrder,
];

export const STATUS_OPTIONS = {
    invoice: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'],
    estimate: ['Draft', 'Sent', 'Accepted', 'Rejected'],
    workOrder: ['Scheduled', 'In Progress', 'On Hold', 'Completed'],
    timeSheet: ['Draft', 'Submitted', 'Approved'],
    purchaseOrder: ['Draft', 'Sent', 'Confirmed', 'Partially delivered', 'Delivered', 'Invoiced', 'Paid', 'Cancelled'], // = lib/poLifecycle.ts PO_STATUSES
    changeOrder: ['Draft', 'Sent', 'Approved', 'Rejected'],
} as const;

export const EXPENSE_CATEGORIES = ['Material', 'Fuel', 'Food', 'Other'] as const;
export const SHIP_TO_TYPES = ['Job Site', 'Company Office', 'Custom'] as const;
export const RECURRENCE_FREQUENCIES = ['Monthly', 'Quarterly', 'Bi-Annually', 'Annually'] as const;
export const PAYMENT_METHODS = ['Cash', 'Check', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Zelle', 'Venmo', 'PayPal', 'Other'] as const;

const text: FieldSpec = { kind: 'text' };
const multiline: FieldSpec = { kind: 'multiline' };
const money: FieldSpec = { kind: 'money' };
const date: FieldSpec = { kind: 'date' };
const image: FieldSpec = { kind: 'image' };

const COMPANY: Record<string, FieldSpec> = {
    companyName: text, companyAddress: text, companyPhone: text, companyWebsite: text,
};
const STYLE: Record<string, FieldSpec> = {
    title: text, logoUrl: image, signatureUrl: image, templateId: { kind: 'template' }, themeColors: { kind: 'colors' },
};

export const DOCUMENT_FIELDS: Record<DocumentFormType, Record<string, FieldSpec>> = {
    [FormType.Invoice]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        invoiceNumber: text, issueDate: date, dueDate: date,
        status: { kind: 'enum', options: STATUS_OPTIONS.invoice },
        lineItems: { kind: 'lineItems' }, isProgressBilling: { kind: 'bool' },
        discount: money, taxRate: { kind: 'percent' }, shipping: money, amountPaid: money,
        notes: multiline, paypalLink: { kind: 'url' }, recurrence: { kind: 'recurrence' },
        ai_visual_data: { kind: 'visual' },
    },
    [FormType.Estimate]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        estimateNumber: text, issueDate: date, expiryDate: date,
        status: { kind: 'enum', options: STATUS_OPTIONS.estimate },
        lineItems: { kind: 'lineItems' }, discount: money, taxRate: { kind: 'percent' }, notes: multiline, terms: multiline,
        ai_visual_data: { kind: 'visual' },
        // the assistant's good / better / best draft (its internal costs come in estimateOptionsInternal, see the merge)
        estimateOptions: { kind: 'estimateOptions' },
    },
    [FormType.WorkOrder]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        workOrderNumber: text, date,
        status: { kind: 'enum', options: STATUS_OPTIONS.workOrder }, assignedTo: text,
        description: multiline, materialsUsed: multiline, hours: { kind: 'number' }, cost: money, terms: multiline,
        ai_visual_data: { kind: 'visual' },
    },
    [FormType.DailyJobReport]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, projectName: text, projectAddress: text,
        reportNumber: text, date, weather: text, temperature: text,
        crewSize: { kind: 'number' }, laborHours: { kind: 'number' },
        content: { kind: 'rich' }, tags: { kind: 'tags' },
        ai_visual_data: { kind: 'visual' },
    },
    [FormType.TimeSheet]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        workerName: text, date, hoursWorked: { kind: 'number' }, overtimeHours: { kind: 'number' },
        status: { kind: 'enum', options: STATUS_OPTIONS.timeSheet },
        notes: multiline,
    },
    [FormType.MaterialLog]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        projectName: text, date, items: { kind: 'materialItems' },
    },
    [FormType.ExpenseLog]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text,
        date, vendor: text, category: { kind: 'enum', options: EXPENSE_CATEGORIES },
        lineItems: { kind: 'lineItems' }, tax: money, amount: money, notes: multiline,
    },
    [FormType.Warranty]: {
        ...STYLE,
        clientId: text, clientName: text, projectAddress: text,
        warrantyNumber: text, completedDate: date, duration: text, coverage: multiline, conditions: multiline,
        ai_visual_data: { kind: 'visual' },
    },
    [FormType.Note]: {
        title: text, content: { kind: 'rich' }, tags: { kind: 'tags' },
        templateId: { kind: 'template' }, themeColors: { kind: 'colors' },
    },
    [FormType.Receipt]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        receiptNumber: text, date, amount: money, paymentMethod: text, description: multiline, invoiceNumber: text,
    },
    [FormType.ChangeOrder]: {
        ...COMPANY, ...STYLE,
        clientId: text, clientName: text, clientAddress: text,
        changeOrderNumber: text, date, reason: text, description: multiline,
        status: { kind: 'enum', options: STATUS_OPTIONS.changeOrder },
        currentContractSum: money, lineItems: { kind: 'lineItems' }, terms: multiline,
        ai_visual_data: { kind: 'visual' },
    },
    [FormType.PurchaseOrder]: {
        ...COMPANY, ...STYLE,
        poNumber: text, date, deliveryDate: date,
        status: { kind: 'enum', options: STATUS_OPTIONS.purchaseOrder },
        vendorName: text, vendorAddress: text, vendorPhone: text, vendorEmail: text,
        shipToType: { kind: 'enum', options: SHIP_TO_TYPES },
        shipToName: text, shipToAddress: text, shipToPhone: text, deliveryInstructions: multiline,
        lineItems: { kind: 'lineItems' }, notes: multiline,
    },
};

/** Generic aliases accepted from older AI payloads; applied only when the canonical key is absent. */
const COMMON_ALIASES: Record<string, string> = {
    company_name: 'companyName', company_address: 'companyAddress', company_phone: 'companyPhone', company_website: 'companyWebsite',
    client_name: 'clientName', client_address: 'clientAddress', customerName: 'clientName', customer: 'clientName',
    logo_url: 'logoUrl', signature_url: 'signatureUrl', template_id: 'templateId',
};

/** Per-type aliases (legacy/generic AI names → types.ts names). */
export const FIELD_ALIASES: Record<DocumentFormType, Record<string, string>> = {
    [FormType.Invoice]: {
        date: 'issueDate', invoiceDate: 'issueDate', number: 'invoiceNumber', documentNumber: 'invoiceNumber', invoice_number: 'invoiceNumber',
        paymentLink: 'paypalLink', payment_link: 'paypalLink', paymentUrl: 'paypalLink', items: 'lineItems', line_items: 'lineItems',
        tax_rate: 'taxRate', progressBilling: 'isProgressBilling', projectAddress: 'clientAddress',
        deposit: 'amountPaid', depositPaid: 'amountPaid', amount_paid: 'amountPaid',
        description_html: 'notes', description: 'notes',
    },
    [FormType.Estimate]: {
        date: 'issueDate', number: 'estimateNumber', documentNumber: 'estimateNumber', estimate_number: 'estimateNumber',
        validUntil: 'expiryDate', dueDate: 'expiryDate', expirationDate: 'expiryDate', items: 'lineItems', line_items: 'lineItems',
        projectAddress: 'clientAddress', description_html: 'notes', description: 'notes',
        tax_rate: 'taxRate', tax: 'taxRate',
    },
    [FormType.WorkOrder]: {
        number: 'workOrderNumber', documentNumber: 'workOrderNumber', description_html: 'description', content: 'description',
        scope: 'description', workDescription: 'description', materials: 'materialsUsed', laborHours: 'hours', hoursWorked: 'hours',
        estimatedCost: 'cost', amount: 'cost', total: 'cost', projectAddress: 'clientAddress',
        assignee: 'assignedTo', assigned_to: 'assignedTo', technician: 'assignedTo', workerName: 'assignedTo', worker: 'assignedTo',
    },
    [FormType.DailyJobReport]: {
        number: 'reportNumber', documentNumber: 'reportNumber', description_html: 'content', richBody: 'content', body: 'content',
        description: 'content', clientAddress: 'projectAddress', jobName: 'projectName',
        crew: 'crewSize', crewCount: 'crewSize', workers: 'crewSize', manpower: 'crewSize', totalLaborHours: 'laborHours', labor_hours: 'laborHours',
    },
    [FormType.TimeSheet]: {
        worker: 'workerName', employee: 'workerName', employeeName: 'workerName', hours: 'hoursWorked', regularHours: 'hoursWorked',
        overtime: 'overtimeHours', description_html: 'notes', description: 'notes', projectAddress: 'clientAddress',
    },
    [FormType.MaterialLog]: {
        lineItems: 'items', materials: 'items', jobName: 'projectName', projectAddress: 'clientAddress',
    },
    [FormType.ExpenseLog]: {
        merchant: 'vendor', supplier: 'vendor', store: 'vendor', total: 'amount', items: 'lineItems',
        description_html: 'notes', description: 'notes',
    },
    [FormType.Warranty]: {
        number: 'warrantyNumber', documentNumber: 'warrantyNumber', date: 'completedDate', completionDate: 'completedDate',
        warrantyPeriod: 'duration', period: 'duration', scope: 'coverage', description_html: 'coverage', description: 'coverage',
        exclusions: 'conditions', terms: 'conditions', clientAddress: 'projectAddress', address: 'projectAddress',
    },
    [FormType.Note]: {
        name: 'title', description_html: 'content', body: 'content', richBody: 'content', description: 'content', notes: 'content',
    },
    [FormType.Receipt]: {
        number: 'receiptNumber', documentNumber: 'receiptNumber', from: 'clientName', payer: 'clientName', receivedFrom: 'clientName',
        total: 'amount', method: 'paymentMethod', description_html: 'description', notes: 'description',
        forInvoice: 'invoiceNumber', invoice: 'invoiceNumber', invoice_number: 'invoiceNumber',
    },
    [FormType.ChangeOrder]: {
        number: 'changeOrderNumber', documentNumber: 'changeOrderNumber', description_html: 'description', content: 'description',
        contractSum: 'currentContractSum', originalContractSum: 'currentContractSum', currentContractValue: 'currentContractSum',
        changeReason: 'reason', items: 'lineItems', projectAddress: 'clientAddress',
    },
    [FormType.PurchaseOrder]: {
        number: 'poNumber', documentNumber: 'poNumber', vendor: 'vendorName', supplier: 'vendorName',
        requiredDate: 'deliveryDate', requiredBy: 'deliveryDate', dueDate: 'deliveryDate', items: 'lineItems',
        instructions: 'deliveryInstructions', description_html: 'notes', description: 'notes',
    },
};

export const getFieldSpecs = (formType: FormType): Record<string, FieldSpec> =>
    (DOCUMENT_FIELDS as Record<string, Record<string, FieldSpec>>)[formType] || {};

export const getAliases = (formType: FormType): Record<string, string> => ({
    ...COMMON_ALIASES,
    ...((FIELD_ALIASES as Record<string, Record<string, string>>)[formType] || {}),
});
