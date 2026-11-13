/**
 * Forms QA: AI prefill contract + form helpers (pure functions, no browser).
 *   npx tsx scripts/forms-prefill-qa.ts
 *
 * Checks, for all 12 document types:
 *  1. every types.ts field the AI may fill is in the field registry and has a visible input in its form
 *  2. a prefill using EXACT types.ts names lands in every field, coerced to the right type
 *  3. legacy/generic names (aliases) land in the right field; control keys and unknown keys are dropped
 *  4. plain-text fields never receive HTML; rich fields are sanitized; numbers are never NaN; dates are local
 *  5. drafts are keyed for exactly-once application (__draftId or content hash)
 * plus document numbering, dates, line-item normalization and receipt OCR parsing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FormType } from '../types.ts';
import { getDraftKey, isAutoSaveDraft, mergeDraftIntoForm } from '../hooks/useDocumentDraftPrefill.ts';
import { DOCUMENT_FIELDS, DOCUMENT_FORM_TYPES, type DocumentFormType, type FieldSpec } from '../components/forms/documentFields.ts';
import { addMonthsISO, htmlToPlainText, localISODate, nextDocumentNumber, normalizeDateValue, normalizeLineItems, sanitizeEditorHtml } from '../components/forms/formUtils.ts';
import { parseReceiptText, parseDate } from '../utils/ocr.ts';
import { computeDocumentTotals, lineItemAmount, roundMoney } from '../utils/money.ts';
import {
    buildInvoiceSeedFromEstimate, buildRevisionSeed, isClientSigned, revisionNumber, signedChangeProblem, unsignedPatch,
} from '../components/forms/signedLock.ts';
import { changeOrderStatus, computeContractValue, isApprovedChangeOrder } from '../components/forms/contractValue.ts';
import { fillEmailPlaceholders, senderIdentity } from '../utils/emailTemplates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
    if (ok) passed += 1;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// 1. types.ts fields (the spec) → registry → visible input
// ---------------------------------------------------------------------------
/** Fields from types.ts that an AI draft may fill, per type (client signatures, inventory flags and legacy fields excluded on purpose). */
const TYPES_TS_FIELDS: Record<DocumentFormType, string[]> = {
    [FormType.Invoice]: ['invoiceNumber', 'issueDate', 'dueDate', 'lineItems', 'taxRate', 'discount', 'shipping', 'amountPaid', 'notes', 'paypalLink', 'status', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'logoUrl', 'signatureUrl', 'title', 'isProgressBilling', 'recurrence', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.Estimate]: ['title', 'estimateNumber', 'issueDate', 'expiryDate', 'lineItems', 'taxRate', 'discount', 'terms', 'notes', 'status', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'logoUrl', 'signatureUrl', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.WorkOrder]: ['title', 'workOrderNumber', 'date', 'status', 'assignedTo', 'description', 'materialsUsed', 'hours', 'cost', 'terms', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'signatureUrl', 'logoUrl', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.DailyJobReport]: ['title', 'reportNumber', 'date', 'weather', 'temperature', 'crewSize', 'laborHours', 'logoUrl', 'signatureUrl', 'content', 'projectName', 'clientName', 'projectAddress', 'tags', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.TimeSheet]: ['title', 'workerName', 'date', 'hoursWorked', 'overtimeHours', 'notes', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'logoUrl', 'signatureUrl', 'status', 'templateId', 'themeColors'],
    [FormType.MaterialLog]: ['title', 'date', 'items', 'projectName', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'logoUrl', 'signatureUrl', 'templateId', 'themeColors'],
    [FormType.ExpenseLog]: ['title', 'date', 'lineItems', 'vendor', 'category', 'amount', 'tax', 'notes', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'logoUrl', 'signatureUrl', 'templateId', 'themeColors'],
    [FormType.Warranty]: ['title', 'warrantyNumber', 'clientName', 'projectAddress', 'completedDate', 'duration', 'coverage', 'conditions', 'signatureUrl', 'logoUrl', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.Note]: ['title', 'content', 'tags', 'templateId', 'themeColors'],
    [FormType.Receipt]: ['title', 'receiptNumber', 'date', 'clientName', 'amount', 'description', 'paymentMethod', 'invoiceNumber', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientAddress', 'logoUrl', 'signatureUrl', 'templateId', 'themeColors'],
    [FormType.ChangeOrder]: ['title', 'changeOrderNumber', 'date', 'status', 'description', 'reason', 'currentContractSum', 'lineItems', 'terms', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'clientName', 'clientAddress', 'logoUrl', 'signatureUrl', 'ai_visual_data', 'templateId', 'themeColors'],
    [FormType.PurchaseOrder]: ['title', 'poNumber', 'date', 'deliveryDate', 'status', 'vendorName', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'shipToType', 'shipToName', 'shipToAddress', 'shipToPhone', 'deliveryInstructions', 'lineItems', 'notes', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'logoUrl', 'signatureUrl', 'templateId', 'themeColors'],
};

const FORM_FILE: Record<DocumentFormType, string> = {
    [FormType.Invoice]: 'InvoiceForm', [FormType.Estimate]: 'EstimateForm', [FormType.WorkOrder]: 'WorkOrderForm',
    [FormType.DailyJobReport]: 'DailyJobReportForm', [FormType.TimeSheet]: 'TimeSheetForm', [FormType.MaterialLog]: 'MaterialLogForm',
    [FormType.ExpenseLog]: 'ExpenseLogForm', [FormType.Warranty]: 'WarrantyForm', [FormType.Note]: 'NoteForm',
    [FormType.Receipt]: 'ReceiptForm', [FormType.ChangeOrder]: 'ChangeOrderForm', [FormType.PurchaseOrder]: 'PurchaseOrderForm',
};

/** Fields rendered by shared sections, and the component that renders them. */
const SHARED: Record<string, string> = {
    companyName: '<CompanySection', companyAddress: '<CompanySection', companyPhone: '<CompanySection', companyWebsite: '<CompanySection',
    clientName: '<ClientSection', clientId: '<ClientSection', clientAddress: '<ClientSection',
    signatureUrl: '<SignatureSection', templateId: '<TemplateSection', themeColors: '<TemplateSection', ai_visual_data: '<AIInsightsSection',
};
const sectionsSrc = readFileSync(join(root, 'components/forms/Sections.tsx'), 'utf8');

for (const type of DOCUMENT_FORM_TYPES) {
    const registry = DOCUMENT_FIELDS[type];
    for (const field of TYPES_TS_FIELDS[type]) check(`[${type}] types.ts field "${field}" is in the registry`, Boolean(registry[field]));

    const src = readFileSync(join(root, 'components', `${FORM_FILE[type]}.tsx`), 'utf8');
    for (const field of Object.keys(registry)) {
        const inForm = new RegExp(`\\b${field}\\b`).test(src);
        const viaShared = SHARED[field] && src.includes(SHARED[field]) && sectionsSrc.includes(field.startsWith('company') || field === 'logoUrl' ? field : 'onChange');
        const logoViaCompany = field === 'logoUrl' && (src.includes('<CompanySection') || src.includes('<LogoField'));
        check(`[${type}] field "${field}" has a visible input`, inForm || Boolean(viaShared) || logoViaCompany);
    }
}

// ---------------------------------------------------------------------------
// 2. exact-name prefill lands in every field (with coercion)
// ---------------------------------------------------------------------------
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const sampleFor = (field: string, spec: FieldSpec): { input: unknown; expect: (v: unknown) => boolean } => {
    switch (spec.kind) {
        case 'text': return { input: `  ${field} value  `, expect: v => v === `${field} value` };
        case 'multiline': return { input: `<p>Line one for ${field}</p><ul><li>item</li></ul>`, expect: v => typeof v === 'string' && v.includes(`Line one for ${field}`) && !/[<>]/.test(v) };
        case 'rich': return { input: '<h2>Summary</h2><p onclick="steal()">Done <b>today</b></p><script>alert(1)</script>', expect: v => typeof v === 'string' && v.includes('<h2>Summary</h2>') && !/script|onclick/i.test(v) };
        case 'number': return { input: '7.5', expect: v => v === 7.5 };
        case 'money': return { input: '$1,250.50', expect: v => v === 1250.5 };
        case 'percent': return { input: '8.25', expect: v => v === 8.25 };
        case 'date': return { input: '2026-11-12T23:30:00Z', expect: v => v === '2026-11-12' };
        case 'bool': return { input: 'yes', expect: v => v === true };
        case 'enum': {
            const option = spec.options![spec.options!.length - 1];
            return { input: option.toUpperCase().replace(/ /g, '_'), expect: v => v === option };
        }
        case 'lineItems': return {
            input: [{ description: '<b>Drywall</b> patch', quantity: '2', rate: '45.5', unitCost: '20' }, { name: 'Labor', qty: 3, price: '$80' }],
            expect: v => Array.isArray(v) && v.length === 2 && (v as any)[0].description === 'Drywall patch' && (v as any)[0].quantity === 2 && (v as any)[0].rate === 45.5
                && (v as any)[1].description === 'Labor' && (v as any)[1].rate === 80 && (v as any)[0].id && (v as any)[0].id !== (v as any)[1].id,
        };
        case 'materialItems': return {
            input: [{ name: '2x4 studs', supplier: 'Lumber Co', quantity: '40', unitCost: '3.95' }],
            expect: v => Array.isArray(v) && (v as any)[0].name === '2x4 studs' && (v as any)[0].quantity === 40 && (v as any)[0].unitCost === 3.95 && Boolean((v as any)[0].id),
        };
        case 'colors': return { input: { primary: '#0a0', secondary: 'navy' }, expect: v => eq(v, { primary: '#00aa00', secondary: '#1e3a8a' }) };
        case 'url': return { input: 'paypal.me/acme', expect: v => v === 'https://paypal.me/acme' };
        case 'image': return { input: PNG, expect: v => v === PNG };
        case 'template': return { input: 'construction', expect: v => v === 'construction' };
        case 'visual': return { input: { metrics: [{ label: 'Hours', value: 8 }] }, expect: v => eq(v, { metrics: [{ label: 'Hours', value: 8 }] }) };
        case 'tags': return { input: 'framing, inspection, framing', expect: v => eq(v, ['framing', 'inspection']) };
        case 'recurrence': return { input: { enabled: 'true', frequency: 'quarterly', nextRunDate: '2027-01-15' }, expect: v => (v as any)?.enabled === true && (v as any)?.frequency === 'Quarterly' && (v as any)?.nextRunDate === '2027-01-15' };
        default: return { input: undefined, expect: () => false };
    }
};

for (const type of DOCUMENT_FORM_TYPES) {
    const registry = DOCUMENT_FIELDS[type];
    const prefill: Record<string, unknown> = { __draftId: `qa-${type}`, rawInput: 'make it', auto_submit: true, ai_open_mode: 'auto_save', document_metadata: { x: 1 }, deductInventory: true, clientSignatureUrl: PNG, someUnknownKey: 'x' };
    const expectations: Record<string, (v: unknown) => boolean> = {};
    for (const [field, spec] of Object.entries(registry)) {
        const s = sampleFor(field, spec);
        prefill[field] = s.input;
        expectations[field] = s.expect;
    }
    const base = { existing: 'kept', status: undefined } as Record<string, unknown>;
    const result = mergeDraftIntoForm(type, base, prefill);
    const out = result.data as Record<string, unknown>;
    for (const [field, expect] of Object.entries(expectations)) {
        check(`[${type}] prefill "${field}" lands with the right value`, expect(out[field]), out[field]);
    }
    for (const control of ['__draftId', 'rawInput', 'auto_submit', 'ai_open_mode', 'document_metadata', 'deductInventory', 'clientSignatureUrl', 'someUnknownKey']) {
        check(`[${type}] control/unknown key "${control}" is not saved`, !(control in out));
    }
    check(`[${type}] untouched keys are kept`, out.existing === 'kept');
    check(`[${type}] AI flag set`, out.isAiGenerated === true);
    check(`[${type}] auto-save detected`, result.autoSave === true);
    check(`[${type}] unknown key reported`, result.ignoredKeys.includes('someUnknownKey'));
    check(`[${type}] prev is not mutated`, !('isAiGenerated' in base));
}

// ---------------------------------------------------------------------------
// 3. aliases, blanks, invalid values
// ---------------------------------------------------------------------------
const merge = (type: FormType, prefill: Record<string, unknown>, prev: Record<string, unknown> = {}) => mergeDraftIntoForm(type, prev, prefill).data as Record<string, any>;

{
    const inv = merge(FormType.Invoice, { date: '11/12/2026', description_html: '<h3>Scope</h3><p>Panel &amp; wiring</p>', items: [{ description: 'Panel', rate: 450 }], paymentLink: 'https://pay.me/x', status: 'paid' });
    check('alias Invoice date → issueDate (M/D/Y)', inv.issueDate === '2026-11-12', inv.issueDate);
    check('alias Invoice description_html → notes as plain text', inv.notes === 'Scope\nPanel & wiring', inv.notes);
    check('alias Invoice items → lineItems', inv.lineItems?.[0]?.rate === 450 && inv.lineItems?.[0]?.quantity === 1);
    check('alias Invoice paymentLink → paypalLink', inv.paypalLink === 'https://pay.me/x');
    check('enum case-insensitive (paid → Paid)', inv.status === 'Paid');
    const exactWins = merge(FormType.Invoice, { issueDate: '2026-01-02', date: '2026-05-05', notes: 'Exact notes', description_html: '<p>alias</p>' });
    check('exact name wins over alias', exactWins.issueDate === '2026-01-02' && exactWins.notes === 'Exact notes');
}
{
    const wo = merge(FormType.WorkOrder, { description_html: '<ul><li>Replace valve</li><li>Test</li></ul>', hoursWorked: '3', total: '450', status: 'Draft' }, { status: 'Scheduled' });
    check('WorkOrder description_html → description, no HTML', wo.description === '• Replace valve\n• Test', wo.description);
    check('WorkOrder hoursWorked → hours number', wo.hours === 3);
    check('WorkOrder total → cost', wo.cost === 450);
    check('invalid enum ignored (Draft is not a work order status)', wo.status === 'Scheduled');
}
{
    const dr = merge(FormType.DailyJobReport, { description_html: '<p>Poured footings</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>', clientAddress: '1 Main St', primary_color: '#123456' });
    check('DailyReport description_html → content, sanitized', typeof dr.content === 'string' && dr.content.includes('Poured footings') && !/onerror|javascript:/i.test(dr.content), dr.content);
    check('DailyReport clientAddress → projectAddress', dr.projectAddress === '1 Main St');
    check('flat primary_color → themeColors', dr.themeColors?.primary === '#123456' && dr.themeColors?.secondary === '#666666');
    const plain = merge(FormType.Note, { content: 'Line 1\n\nLine <2>' });
    check('rich field from plain text is escaped into paragraphs', plain.content === '<p>Line 1</p><p>Line &lt;2&gt;</p>', plain.content);
}
{
    const ml = merge(FormType.MaterialLog, { lineItems: [{ description: 'Rebar', quantity: '10', rate: '12.5' }], deductInventory: true });
    check('MaterialLog lineItems → items (description→name, rate→unitCost)', ml.items?.[0]?.name === 'Rebar' && ml.items?.[0]?.unitCost === 12.5 && ml.items?.[0]?.quantity === 10);
    check('MaterialLog never takes deductInventory from AI', !('deductInventory' in ml));
}
{
    const ex = merge(FormType.ExpenseLog, { items: [{ description: 'Gas', amount: '54.20' }], merchant: 'Shell', tax: '3.1', category: 'fuel' });
    check('ExpenseLog legacy items → lineItems', ex.lineItems?.[0]?.description === 'Gas' && ex.lineItems?.[0]?.rate === 54.2);
    check('ExpenseLog merchant → vendor, tax numeric, category', ex.vendor === 'Shell' && ex.tax === 3.1 && ex.category === 'Fuel');
    const single = merge(FormType.ExpenseLog, { item: 'Lunch for crew', amount: 64, tax: 4 });
    check('ExpenseLog single legacy item → one line (amount − tax)', single.lineItems?.length === 1 && single.lineItems[0].rate === 60 && single.amount === 64);
}
{
    const po = merge(FormType.PurchaseOrder, { vendor: 'Home Depot Pro', requiredDate: '2026-11-20', shipToType: 'job site', description_html: '<p>Deliver AM</p>' });
    check('PO vendor → vendorName', po.vendorName === 'Home Depot Pro');
    check('PO requiredDate → deliveryDate', po.deliveryDate === '2026-11-20');
    check('PO shipToType enum', po.shipToType === 'Job Site');
    check('PO description_html → notes (plain)', po.notes === 'Deliver AM');
    const rc = merge(FormType.Receipt, { from: 'Jane Smith', total: '1,000', method: 'Zelle' });
    check('Receipt from → clientName, total → amount, method → paymentMethod', rc.clientName === 'Jane Smith' && rc.amount === 1000 && rc.paymentMethod === 'Zelle');
    const wa = merge(FormType.Warranty, { date: '2026-10-01', clientAddress: '9 Oak Rd', warrantyPeriod: '2 Years', companyName: 'not a warranty field' });
    check('Warranty date → completedDate, clientAddress → projectAddress, period → duration', wa.completedDate === '2026-10-01' && wa.projectAddress === '9 Oak Rd' && wa.duration === '2 Years');
    check('Warranty ignores fields it does not have', !('companyName' in wa));
    const co = merge(FormType.ChangeOrder, { originalContractSum: '25000', changeReason: 'Client request', description_html: '<p>Add outlet</p>' });
    check('ChangeOrder aliases', co.currentContractSum === 25000 && co.reason === 'Client request' && co.description === 'Add outlet');
    const est2 = merge(FormType.Estimate, { tax: '8.25', discount: '$50' });
    check('Estimate tax alias → taxRate, discount money', est2.taxRate === 8.25 && est2.discount === 50, est2);
    const wo2 = merge(FormType.WorkOrder, { assignee: 'Carlos' });
    check('WorkOrder assignee → assignedTo', wo2.assignedTo === 'Carlos', wo2);
    const co2 = merge(FormType.ChangeOrder, { status: 'approved' });
    check('ChangeOrder status enum (approved → Approved)', co2.status === 'Approved', co2.status);
    const inv2 = merge(FormType.Invoice, { deposit: '250' });
    check('Invoice deposit → amountPaid', inv2.amountPaid === 250, inv2.amountPaid);
    const ts = merge(FormType.TimeSheet, { employee: 'Sam', hours: '8', overtime: '1.5', status: 'submitted' });
    check('TimeSheet aliases', ts.workerName === 'Sam' && ts.hoursWorked === 8 && ts.overtimeHours === 1.5 && ts.status === 'Submitted');
    const est = merge(FormType.Estimate, { validUntil: '2026-12-31', projectAddress: '5 Elm St', templateDescription: 'luxury gold' });
    check('Estimate validUntil → expiryDate, projectAddress → clientAddress', est.expiryDate === '2026-12-31' && est.clientAddress === '5 Elm St');
    check('template style description → current design id', typeof est.templateId === 'string' && est.templateId !== 'standard', est.templateId);
    // the original designs are restored under their own ids: a pre-2026-11 id is kept and renders that design
    const legacyTpl = merge(FormType.Invoice, { templateId: 'template_html_2' });
    check('legacy template id → its restored design', legacyTpl.templateId === 'template_html_2', legacyTpl.templateId);
    const aliasTpl = merge(FormType.Invoice, { templateId: 'Neon Cyberpunk' });
    check('template display name → design id', aliasTpl.templateId === 'template_neon', aliasTpl.templateId);
}
{
    const prev = { clientName: 'Existing', taxRate: 5, notes: 'keep', lineItems: [{ id: 'a', description: 'x', quantity: 1, rate: 1 }], signatureUrl: PNG };
    const r = merge(FormType.Invoice, { clientName: '   ', taxRate: '', notes: null, lineItems: [], signatureUrl: 'javascript:alert(1)', discount: 'abc', shipping: Number.NaN }, prev);
    check('blank values never overwrite', r.clientName === 'Existing' && r.taxRate === 5 && r.notes === 'keep' && r.lineItems.length === 1);
    check('unsafe image URL rejected', r.signatureUrl === PNG);
    check('non-numeric / NaN numbers ignored (never NaN)', !('discount' in r) && !('shipping' in r));
    const noSig = merge(FormType.Invoice, { signatureRequested: false }, prev);
    check('signatureRequested:false clears the signature', noSig.signatureUrl === '');
    const html = merge(FormType.Estimate, { clientName: '<img src=x onerror=alert(1)>Acme <b>Co</b>', terms: '<script>bad()</script><p>Net 30</p>' });
    check('HTML never reaches plain-text fields', html.clientName === 'Acme Co' && html.terms === 'Net 30', [html.clientName, html.terms]);
    const neg = merge(FormType.Invoice, { taxRate: '150', discount: '-20' });
    check('percent clamped, money non-negative', neg.taxRate === 100 && neg.discount === 0);
}

// ---------------------------------------------------------------------------
// 4. exactly-once keys
// ---------------------------------------------------------------------------
{
    const a = { clientName: 'A', lineItems: [{ description: 'x', rate: 1 }] };
    check('draft key uses __draftId', getDraftKey(FormType.Invoice, { ...a, __draftId: 'd1' }) === 'id:d1');
    check('same content → same key (volatile flags ignored)', getDraftKey(FormType.Invoice, { ...a, auto_submit: true }) === getDraftKey(FormType.Invoice, { ...a, ai_open_mode: 'review' }));
    check('different content → different key', getDraftKey(FormType.Invoice, a) !== getDraftKey(FormType.Invoice, { ...a, clientName: 'B' }));
    check('different type → different key', getDraftKey(FormType.Invoice, a) !== getDraftKey(FormType.Estimate, a));
    check('empty prefill → no key', getDraftKey(FormType.Invoice, {}) === null && getDraftKey(FormType.Invoice, undefined) === null);
    check('__autoSave and legacy auto_submit detected', isAutoSaveDraft({ __autoSave: true }) && isAutoSaveDraft({ auto_submit: true }) && !isAutoSaveDraft({ ai_open_mode: 'review' }));
    // no leak: draft B applied to fresh defaults contains nothing from draft A
    const defaults = { clientName: '', notes: '' };
    const afterA = merge(FormType.Invoice, { clientName: 'A Corp', paypalLink: 'https://pay.me/a', ai_visual_data: { metrics: [] , progress_percentage: 10 } }, defaults);
    const afterB = merge(FormType.Invoice, { clientName: 'B Corp' }, defaults);
    check('second draft starts from defaults (no leak)', afterA.paypalLink && !afterB.paypalLink && !afterB.ai_visual_data && afterB.clientName === 'B Corp');
}

// ---------------------------------------------------------------------------
// 5. helpers: numbers, dates, line items, totals, OCR
// ---------------------------------------------------------------------------
{
    const nov = new Date(2026, 10, 12);
    check('next number from existing', nextDocumentNumber('INV', ['INV-2026-11-001', 'INV-2026-11-007', 'INV-2026-10-099', 'EST-2026-11-050'], nov) === 'INV-2026-11-008');
    check('next number first of month', nextDocumentNumber('INV', [], nov) === 'INV-2026-11-001');
    check('next number skips taken custom values', nextDocumentNumber('PO', ['po-2026-11-001'], nov) === 'PO-2026-11-002');
    const late = new Date(2026, 10, 12, 23, 30);
    check('local date (not UTC) late in the evening', localISODate(late) === '2026-11-12');
    check('addMonths clamps to month end', addMonthsISO(1, '2026-01-31') === '2026-02-28');
    check('date D/M when day > 12', normalizeDateValue('25/12/2026') === '2026-12-25');
    check('invalid date rejected', normalizeDateValue('2026-02-30') === null && normalizeDateValue('soon') === null);
    const items = normalizeLineItems([{ id: 'same', description: 'a', rate: '1' }, { id: 'same', description: 'b', rate: '2' }, { description: '', rate: '' }]);
    check('line items: duplicate ids replaced, empty rows dropped', items.length === 2 && items[0].id !== items[1].id, items.map(i => i.id));
    check('htmlToPlainText decodes entities', htmlToPlainText('<p>A &amp; B</p><p>C</p>') === 'A & B\nC');
    check('editor sanitizer (no DOM) strips handlers', !/onerror/.test(sanitizeEditorHtml('<img src="https://x/y.png" onerror="z()">')));
    const totals = computeDocumentTotals({ lineItems: [{ quantity: 2, rate: 100 }], discount: 20, taxRate: 10, shipping: 5 });
    check('money.ts totals (shared with PDF)', totals.total === 203, totals);
}
{
    const receipt = [
        'THE HOME DEPOT',
        '123 Main St, Springfield, IL 62701',
        '(217) 555-0100',
        'Date: 03/14/2026',
        'DESCRIPTION            AMOUNT',
        '2 x 2X4 STUD 8FT         7.96',
        'DRYWALL SCREWS 1LB       9.98',
        'SUBTOTAL                17.94',
        'SALES TAX                1.25',
        'TOTAL                   19.19',
        'CASH                    40.00',
        'CHANGE                  20.81',
        'Thank you for shopping!',
    ].join('\n');
    const r = parseReceiptText(receipt);
    check('OCR vendor', r.vendor === 'Home Depot', r.vendor);
    check('OCR total is the TOTAL line, not cash tendered', r.amount === 19.19, r.amount);
    check('OCR tax is a number', r.tax === 1.25, r.tax);
    check('OCR date M/D (day > 12)', r.date === '2026-03-14', r.date);
    check('OCR items', r.lineItems.length === 2 && r.lineItems[0].price === 7.96 && r.lineItems[0].quantity === 2, r.lineItems);
    check('OCR vendor contact kept separate', r.vendorPhone === '(217) 555-0100' && Boolean(r.vendorAddress));
    check('OCR no client on a plain store receipt', r.client === null, r.client);
    check('OCR client from "Sold To:"', parseReceiptText('CITY SUPPLY\nSold To: Jane Smith\nTOTAL 10.00').client === 'Jane Smith');
    check('OCR client on the line below "Bill to"', parseReceiptText('ACME LUMBER\nBILL TO\nMaple Street Builders LLC\n2 x STUD 7.96\nTOTAL 7.96').client === 'Maple Street Builders LLC');
    check('OCR "Customer Copy" is not a client', parseReceiptText('ACE HARDWARE\nCUSTOMER COPY\nTOTAL 5.00').client === null);
    check('OCR ambiguous date follows locale (day-first)', parseDate('Date 04/05/2026', true) === '2026-05-04');
    check('OCR ambiguous date follows locale (month-first)', parseDate('Date 04/05/2026', false) === '2026-04-05');
}

// ---------------------------------------------------------------------------
// 6. money rounding (QA 0b.18): half-up to cents, the same in forms and PDFs
// ---------------------------------------------------------------------------
{
    check('roundMoney 29.994999999999997 → 30 (50% of 99.99 − 20)', roundMoney(99.99 * 0.5 - 20) === 30, roundMoney(99.99 * 0.5 - 20));
    check('roundMoney half-up 1.005 → 1.01, 2.675 → 2.68, 0.005 → 0.01', roundMoney(1.005) === 1.01 && roundMoney(2.675) === 2.68 && roundMoney(0.005) === 0.01);
    check('roundMoney keeps 1.004 → 1, 0.1+0.2 → 0.3', roundMoney(1.004) === 1 && roundMoney(0.1 + 0.2) === 0.3);
    check('roundMoney negative half away from zero (−29.995 → −30), no −0', roundMoney(-29.995) === -30 && Object.is(roundMoney(-0.001), 0));
    const progressLine = { quantity: 1, rate: 99.99, percentComplete: 50, previouslyBilled: 20 };
    check('progress line 50% of $99.99 − $20 = $30.00', lineItemAmount(progressLine, true) === 30, lineItemAmount(progressLine, true));
    check('progress invoice total $30.00', computeDocumentTotals({ isProgressBilling: true, lineItems: [progressLine] }).total === 30);
    check('progress % above 100 is clamped in the math', lineItemAmount({ quantity: 1, rate: 100, percentComplete: 150 }, true) === 100);
    check('estimate totals with tax and discount', computeDocumentTotals({ lineItems: [{ quantity: 2, rate: 250.5 }], discount: 21.5, taxRate: 7.5 }).total === 515.46);
}

// ---------------------------------------------------------------------------
// 7. signed estimates / change orders (QA 0b.1)
// ---------------------------------------------------------------------------
{
    const signed = {
        estimateNumber: 'EST-2026-11-004', status: 'Accepted', issueDate: '2026-11-01', expiryDate: '2026-12-01',
        lineItems: [{ id: 'a', description: 'Cabinets', quantity: 1, rate: 1500, unitCost: 900 }], taxRate: 5, discount: 0,
        terms: 'Net 30', notes: 'Scope', clientName: 'Jane', clientSignatureUrl: 'data:image/png;base64,AAAA', clientSignedAt: '2026-11-13T10:00:00Z', clientSignedBy: 'Jane Doe',
        isAiGenerated: true, templateId: 'classic',
    };
    check('signed detection', isClientSigned(signed) && !isClientSigned({ status: 'Accepted' }) && !isClientSigned({ clientSignatureUrl: '', clientSignedAt: '' }));
    const edited = { ...signed, lineItems: [{ ...signed.lineItems[0], rate: 9999 }] };
    const problem = signedChangeProblem(signed, edited, 'estimate');
    check('save refused: line price changed on a signed estimate', Boolean(problem && /Jane Doe/.test(problem) && /Nov 13, 2026/.test(problem)), problem);
    check('save refused: tax changed on a signed estimate', Boolean(signedChangeProblem(signed, { ...signed, taxRate: 0 }, 'estimate')));
    check('save refused: terms changed on a signed estimate', Boolean(signedChangeProblem(signed, { ...signed, terms: 'Net 60' }, 'estimate')));
    check('allowed: design change on a signed estimate', signedChangeProblem(signed, { ...signed, templateId: 'modern' }, 'estimate') === null);
    check('allowed: internal cost change (never printed)', signedChangeProblem(signed, { ...signed, lineItems: [{ ...signed.lineItems[0], unitCost: 1 }] }, 'estimate') === null);
    check('allowed: unlock (signature cleared + Draft) with new lines', signedChangeProblem(signed, { ...edited, ...unsignedPatch() }, 'estimate') === null);
    check('refused: signature cleared but not Draft', Boolean(signedChangeProblem(signed, { ...signed, ...unsignedPatch(), status: 'Accepted' }, 'estimate')));
    check('allowed: anything on an unsigned estimate', signedChangeProblem({ ...signed, clientSignatureUrl: '', clientSignedAt: '' }, edited, 'estimate') === null);
    const co = { changeOrderNumber: 'CO-1', currentContractSum: 1000, lineItems: [{ id: 'c', description: 'Outlet', quantity: 1, rate: 150 }], clientSignedAt: '2026-11-13T10:00:00Z', clientSignatureUrl: 'x' };
    check('save refused: contract value changed on a signed change order', Boolean(signedChangeProblem(co, { ...co, currentContractSum: 2000 }, 'changeOrder')));
    check('unsigned patch keeps the keys (empty, so the database does not restore them)', Object.keys(unsignedPatch()).includes('clientSignatureUrl') && unsignedPatch().clientSignatureUrl === '' && unsignedPatch().status === 'Draft');

    check('revision numbers', revisionNumber('EST-2026-11-004') === 'EST-2026-11-004-R2' && revisionNumber('EST-2026-11-004-R2') === 'EST-2026-11-004-R3' && revisionNumber('') === '');
    const rev = buildRevisionSeed(signed, 'estimate', 'doc-1', '2026-11-20') as Record<string, any>;
    check('revision: Draft, new number, today, same lines/tax, linked, no signature, no AI flag',
        rev.status === 'Draft' && rev.estimateNumber === 'EST-2026-11-004-R2' && rev.issueDate === '2026-11-20' && rev.expiryDate === '2026-12-20'
        && rev.lineItems?.[0]?.rate === 1500 && rev.taxRate === 5 && rev.revisionOf === 'doc-1'
        && !('clientSignatureUrl' in rev) && !('clientSignedAt' in rev) && !('isAiGenerated' in rev), rev);
    check('revision lines are copies (the signed document is never mutated)', rev.lineItems[0] !== signed.lineItems[0]);
    const coRev = buildRevisionSeed({ ...co, status: 'Accepted', reason: 'Client request' }, 'changeOrder', 'co-1', '2026-11-20') as Record<string, any>;
    check('change order revision', coRev.changeOrderNumber === 'CO-1-R2' && coRev.status === 'Draft' && coRev.currentContractSum === 1000 && coRev.date === '2026-11-20' && coRev.revisionOf === 'co-1', coRev);

    const inv = buildInvoiceSeedFromEstimate(signed, 'doc-1', { deposit: 300 }) as Record<string, any>;
    check('convert to invoice: client, lines (cost kept), tax, discount, deposit, link back',
        inv.clientName === 'Jane' && inv.lineItems?.[0]?.rate === 1500 && inv.lineItems?.[0]?.unitCost === 900 && inv.taxRate === 5 && inv.discount === 0
        && inv.amountPaid === 300 && inv.sourceEstimateId === 'doc-1' && inv.sourceEstimateNumber === 'EST-2026-11-004' && inv.status === 'Draft'
        && !('invoiceNumber' in inv) && !('clientSignatureUrl' in inv) && !('terms' in inv) && !('isAiGenerated' in inv), inv);
    const invTotals = computeDocumentTotals(inv);
    check('converted invoice total = estimate total, balance = total − deposit', invTotals.total === computeDocumentTotals(signed).total && invTotals.balanceDue === roundMoney(invTotals.total - 300), invTotals);
    check('convert without deposit has no amountPaid', !('amountPaid' in buildInvoiceSeedFromEstimate(signed, 'x', { deposit: 0 })));
}

// ---------------------------------------------------------------------------
// 8. change order status + contract value (QA 0b.12)
// ---------------------------------------------------------------------------
{
    check('change order status: approval link "Accepted" shown as Approved', changeOrderStatus({ status: 'Accepted' }) === 'Approved' && changeOrderStatus({ clientSignedAt: 'x' }) === 'Approved' && changeOrderStatus({}) === 'Draft' && changeOrderStatus({ status: 'Sent' }) === 'Sent');
    check('approved change order detection', isApprovedChangeOrder({ status: 'Approved' }) && isApprovedChangeOrder({ status: 'Accepted' }) && isApprovedChangeOrder({ clientSignedAt: 'x' }) && !isApprovedChangeOrder({ status: 'Sent' }));
    const rows = [
        { id: 'e1', type: 'Estimate', created_at: '2026-11-01T00:00:00Z', data: { status: 'Accepted', estimateNumber: 'EST-1', lineItems: [{ quantity: 1, rate: 10000 }], taxRate: 10, discount: 0 } },
        { id: 'e0', type: 'Estimate', created_at: '2026-10-01T00:00:00Z', data: { status: 'Draft', lineItems: [{ quantity: 1, rate: 99999 }] } },
        { id: 'c1', type: 'Change Order', created_at: '2026-11-02T00:00:00Z', data: { status: 'Approved', changeOrderNumber: 'CO-1', lineItems: [{ quantity: 1, rate: 500 }] } },
        { id: 'c2', type: 'Change Order', created_at: '2026-11-03T00:00:00Z', data: { clientSignedAt: '2026-11-04', changeOrderNumber: 'CO-2', lineItems: [{ quantity: 1, rate: -200 }] } },
        { id: 'c3', type: 'Change Order', created_at: '2026-11-05T00:00:00Z', data: { status: 'Sent', lineItems: [{ quantity: 1, rate: 700 }] } },
        { id: 'c4', type: 'Change Order', created_at: '2026-11-09T00:00:00Z', data: { status: 'Approved', lineItems: [{ quantity: 1, rate: 800 }] } },
    ];
    const cv = computeContractValue(rows);
    check('contract value = accepted estimate (with tax) + approved change orders', cv.estimateTotal === 11000 && cv.changeOrdersTotal === 1100 && cv.total === 12100, cv);
    const earlier = computeContractValue(rows, { excludeId: 'c4', createdBefore: '2026-11-09T00:00:00Z' });
    check('only EARLIER approved change orders count, never itself', earlier.total === 11300 && earlier.changeOrders.length === 2, earlier);
    const revised = computeContractValue([...rows, { id: 'e2', type: 'Estimate', created_at: '2026-11-06T00:00:00Z', data: { status: 'Accepted', revisionOf: 'e1', lineItems: [{ quantity: 1, rate: 12000 }] } }]);
    check('an accepted revision replaces the signed estimate it revises (not counted twice)', revised.estimateTotal === 12000 && revised.estimates.length === 1, revised);
    check('no accepted estimate → nothing counted', computeContractValue([rows[1]]).total === 0);
}

// ---------------------------------------------------------------------------
// 9. share email sender (QA 0b.6): company → name → email, never "from" with nothing
// ---------------------------------------------------------------------------
{
    const values = (p: Parameters<typeof senderIdentity>[0]) => {
        const s = senderIdentity(p);
        return { '[My Company]': s.company, '[My Name]': s.name, '[Document Number]': 'INV-1', '[Client Name]': 'Jane' };
    };
    const subject = 'Invoice [Document Number] from [My Company]';
    const body = 'Hi [Client Name],\n\nHere is invoice [Document Number].\n\nThank you,\n[My Name]\n[My Company]';
    const noCompany = values({ name: 'Bob Builder', email: 'bob@x.com', companyName: '' });
    check('no company: subject uses the name', fillEmailPlaceholders(subject, noCompany) === 'Invoice INV-1 from Bob Builder', fillEmailPlaceholders(subject, noCompany));
    check('no company: sign-off is the name once', fillEmailPlaceholders(body, noCompany).endsWith('Thank you,\nBob Builder'), fillEmailPlaceholders(body, noCompany));
    const onlyEmail = values({ name: '', email: 'bob@x.com', companyName: '' });
    check('no company, no name: the email', fillEmailPlaceholders(subject, onlyEmail) === 'Invoice INV-1 from bob@x.com' && fillEmailPlaceholders(body, onlyEmail).endsWith('Thank you,\nbob@x.com'), fillEmailPlaceholders(body, onlyEmail));
    const full = values({ name: 'Bob', email: 'bob@x.com', companyName: 'Acme' });
    check('company and name: both lines', fillEmailPlaceholders(body, full).endsWith('Thank you,\nBob\nAcme'));
    const companyOnly = values({ name: '', email: 'bob@x.com', companyName: 'Acme' });
    check('company without a name: no blank line', fillEmailPlaceholders(body, companyOnly).endsWith('Thank you,\nAcme'), fillEmailPlaceholders(body, companyOnly));
    check('subject never ends with a dangling "from"', fillEmailPlaceholders('Note [Document Number] from [My Company]', { '[Document Number]': '', '[My Company]': '' }) === 'Note');
}

// ---------------------------------------------------------------------------
const total = passed + failures.length;
if (failures.length) {
    console.error(`\nforms-prefill-qa: ${failures.length} of ${total} checks FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log(`forms-prefill-qa: all ${total} checks passed (${DOCUMENT_FORM_TYPES.length} document types)`);
