/**
 * Document data for documents a RUN_PLAN step saves directly (no form is opened).
 *
 * It runs the same steps a form runs for a new AI draft that is saved, so the document opens and
 * renders exactly like one the user saved from the form:
 *   1. the form's defaults for a new document (mirror of each form's `makeDefaults`, see below)
 *   2. `finalizeDraft`   – the assistant's normalization + job / client / company context; lines the assistant took from
 *      the price book become the hand-picked price-book line (src/ai/priceBookContext.ts)
 *   3. `mergeDraftIntoForm` – the exact merge a form applies to `prefillData`
 *   4. the next number of the form's series (PREFIX-YYYY-MM-NNN, unique against existing numbers)
 *   5. the form's own `prepare` (sanitized report/note HTML, expense total, payment link, estimate options saved
 *      client-safe with lineItems mirroring the option that counts)
 *   6. status Draft (plans never create sent/paid documents) and `isAiGenerated`.
 * Totals are not stored: the forms, PDFs and lists compute them from the line items (utils/money.ts).
 *
 * Pure (no network), so the QA script checks it under Node.
 */
import { FormType } from '../../types.ts';
import type { Client, Job, UserProfile } from '../../types.ts';
import { DOC_TYPE_TO_FORM_TYPE } from '../config/docTypeMap.ts';
import { getSchema, type DocKey } from '../config/documentFieldRequirements.ts';
import { finalizeDraft } from '../../utils/documentDraft.ts';
import { mergeDraftIntoForm } from '../../hooks/useDocumentDraftPrefill.ts';
import {
    addDaysISO, blankLineItem, blankMaterialItem, DOC_NUMBER_CONFIG, nextDocumentNumber, normalizeLinkUrl, sanitizeEditorHtml, todayISO,
} from '../../components/forms/formUtils.ts';
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME } from '../../components/forms/useDocumentForm.ts';
import { computeDocumentTotals, roundMoney, toNumber } from '../../utils/money.ts';
import { packOptionsForSave } from '../../lib/estimateOptions.ts';
import { linkDraftToPriceBook, type PriceBookSource } from './priceBookContext.ts';

export interface PlanDocumentContext {
    /** The job the document is filed under (its client fields are the defaults). */
    job: Job;
    /** The document's own client (wins over the job's client). */
    client?: Pick<Client, 'name'> & Partial<Pick<Client, 'id' | 'address'>> | null;
    clients?: Client[];
    profile?: UserProfile | null;
    /** Numbers already used for this document type (database + this run). */
    existingNumbers?: Iterable<string | null | undefined>;
    /** The user's text, for the daily-report fact guards (undefined = sample data, no guards). */
    userText?: string;
    /** User's local date YYYY-MM-DD. */
    today?: string;
    /** Clock for the number series (tests). */
    now?: Date;
    /** The user's price book (App's saved items): lines linked to an item get its unit cost and kit parts. */
    priceBook?: readonly PriceBookSource[] | null;
}

export interface PlanDocument {
    formType: FormType;
    data: Record<string, unknown>;
    /** The document number (when the type has one). */
    number?: string;
    /** "Invoice INV-2026-11-004" */
    label: string;
}

/** Types whose status list starts with Draft (STATUS_OPTIONS in components/forms/documentFields.ts). */
const DRAFT_STATUS_TYPES = new Set<FormType>([FormType.Invoice, FormType.Estimate, FormType.TimeSheet, FormType.PurchaseOrder, FormType.ChangeOrder]);

/**
 * Defaults of a brand-new document, as each form builds them in `makeDefaults`.
 * Keep in sync with components/<Type>Form.tsx (a missing key is harmless: the form's `hydrate` fills it).
 */
export function makeDocumentDefaults(formType: FormType, job: Job, profile: UserProfile | null | undefined, today: string = todayISO()): Record<string, unknown> {
    const p = (profile || {}) as Partial<UserProfile>;
    const company = {
        companyName: p.companyName || '',
        companyAddress: p.address || '',
        companyPhone: p.phone || '',
        companyWebsite: p.website || '',
    };
    const style = { logoUrl: p.logoUrl || '', signatureUrl: '', templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME } };
    const client = { clientName: job.clientName || '', clientAddress: job.clientAddress || '' };
    switch (formType) {
        case FormType.Invoice:
            return {
                title: '', invoiceNumber: '', issueDate: today, dueDate: addDaysISO(30, today), status: 'Draft', lineItems: [blankLineItem()],
                isProgressBilling: false, discount: 0, taxRate: 0, shipping: 0, notes: 'Thank you for your business.', paypalLink: '',
                ...company, ...client, ...style, recurrence: { enabled: false, frequency: 'Monthly' },
            };
        case FormType.Estimate:
            return {
                title: '', estimateNumber: '', issueDate: today, expiryDate: addDaysISO(30, today), status: 'Draft',
                lineItems: [{ ...blankLineItem(), unitCost: 0 }], discount: 0, taxRate: 0, notes: '',
                terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
                ...company, ...client, ...style,
            };
        case FormType.WorkOrder:
            return {
                title: '', workOrderNumber: '', date: today, status: 'Scheduled', assignedTo: job.workerName || '', description: '', materialsUsed: '', hours: 0, cost: 0,
                terms: 'Payment is due upon completion of work. Any changes to the scope of work must be approved in writing.',
                ...company, ...client, ...style,
            };
        case FormType.DailyJobReport:
            return {
                title: '', reportNumber: '', date: today, weather: '', temperature: '', content: '', tags: [],
                projectName: job.name || '', projectAddress: job.clientAddress || '', clientName: job.clientName || '',
                ...company, ...style,
            };
        case FormType.TimeSheet:
            return {
                title: '', workerName: job.workerName || p.name || '', date: today, hoursWorked: 8, overtimeHours: 0, notes: '', status: 'Draft',
                ...company, ...client, ...style,
            };
        case FormType.MaterialLog:
            return {
                title: '', date: today, projectName: job.name || '', items: [blankMaterialItem()],
                ...company, ...client, ...style, deductInventory: false,
            };
        case FormType.ExpenseLog:
            return {
                title: '', date: today, item: '', lineItems: [blankLineItem()], vendor: '', category: 'Material', amount: 0, tax: 0, notes: '',
                ...company, clientName: job.clientName || '', ...style,
            };
        case FormType.Warranty:
            return {
                title: '', warrantyNumber: '', clientName: job.clientName || '', projectAddress: job.clientAddress || '', completedDate: today,
                duration: '1 Year',
                coverage: 'This warranty covers defects in workmanship and materials provided by the contractor for the duration specified above. We will repair or replace any defective work at no cost to the owner.',
                conditions: 'This warranty does not cover damage resulting from normal wear and tear, negligence, abuse, natural disasters, or modifications made by others. Notification of any defect must be made in writing within the warranty period.',
                signatureUrl: '', logoUrl: p.logoUrl || '', templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME },
            };
        case FormType.Note:
            return { title: '', content: '', tags: [], templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME } };
        case FormType.Receipt:
            return {
                title: '', receiptNumber: '', date: today, ...client, amount: 0, description: 'Payment for services rendered', paymentMethod: 'Check',
                ...company, ...style,
            };
        case FormType.ChangeOrder:
            return {
                title: '', changeOrderNumber: '', date: today, status: 'Draft', reason: '', description: '', currentContractSum: 0, lineItems: [blankLineItem()],
                terms: 'The Contract Time will be increased by 0 days. All other terms and conditions of the original contract remain in full force and effect.',
                ...company, ...client, ...style,
            };
        case FormType.PurchaseOrder:
            return {
                title: '', poNumber: '', date: today, deliveryDate: addDaysISO(3, today), status: 'Draft',
                vendorName: '', vendorAddress: '', vendorPhone: '', vendorEmail: '', shipToType: 'Job Site',
                shipToName: job.clientName || job.name || p.companyName || '', shipToAddress: job.clientAddress || '', shipToPhone: '',
                deliveryInstructions: '', lineItems: [blankLineItem()], notes: '', ...company, ...style,
            };
        default:
            return { title: '', ...company, ...style };
    }
}

/** Builds the full `data` of a plan document. See the file comment for the steps. */
export function buildPlanDocument(docType: DocKey, rawPrefill: Record<string, unknown> | null | undefined, ctx: PlanDocumentContext): PlanDocument {
    const formType = DOC_TYPE_TO_FORM_TYPE[docType];
    const today = ctx.today || todayISO();
    const schema = getSchema(docType);
    // The document's client replaces the job's client in the defaults and in the context fill.
    const job: Job = ctx.client
        ? { ...ctx.job, clientName: ctx.client.name, clientAddress: ctx.client.address || (ctx.job.clientName === ctx.client.name ? ctx.job.clientAddress : '') || '' }
        : ctx.job;
    const prefill = linkDraftToPriceBook(finalizeDraft(docType, rawPrefill || {}, {
        job, client: (ctx.client as Client | null) || null, clients: ctx.clients, profile: ctx.profile, userText: ctx.userText, today,
    }), ctx.priceBook);
    if (ctx.client) {
        if (schema.clientName) prefill.clientName = ctx.client.name;
        if (schema.clientAddress && ctx.client.address) prefill.clientAddress = ctx.client.address;
    }

    const base = makeDocumentDefaults(formType, job, ctx.profile, today);
    let data = { ...mergeDraftIntoForm(formType, base, prefill).data } as Record<string, unknown>;

    // Number: the form's series, unique against every known number (a model number that is taken is replaced).
    const cfg = DOC_NUMBER_CONFIG[formType];
    let number: string | undefined;
    if (cfg) {
        const taken = new Set(Array.from(ctx.existingNumbers || []).filter((n): n is string => typeof n === 'string' && !!n.trim()).map(n => n.trim().toUpperCase()));
        const given = String(data[cfg.field] || '').trim();
        number = given && !taken.has(given.toUpperCase()) ? given : nextDocumentNumber(cfg.prefix, taken, ctx.now || new Date());
        data[cfg.field] = number;
    }

    // The form's `prepare` before saving.
    if (formType === FormType.DailyJobReport || formType === FormType.Note) data.content = sanitizeEditorHtml(data.content);
    if (formType === FormType.ExpenseLog) {
        const sub = computeDocumentTotals({ lineItems: (data.lineItems as never) || [] }).subtotal;
        if (sub > 0) data.amount = roundMoney(sub + toNumber(data.tax));
    }
    if (formType === FormType.Invoice && data.paypalLink) data.paypalLink = normalizeLinkUrl(data.paypalLink) || data.paypalLink;
    // EstimateForm's prepare: good / better / best option lines saved without internal costs (estimateOptionsInternal)
    if (formType === FormType.Estimate) data = packOptionsForSave(data);

    if (DRAFT_STATUS_TYPES.has(formType)) data.status = 'Draft';
    data.isAiGenerated = true;

    const label = number ? `${formType} ${number}` : String(data.title || '').trim() ? `${formType}: ${String(data.title).trim()}` : formType;
    return { formType, data, number, label };
}
