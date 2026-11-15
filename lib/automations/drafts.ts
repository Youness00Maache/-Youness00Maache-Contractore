/**
 * The data of the two drafts a rule can make. PURE (no network): lib/automations/actions.ts inserts them.
 *
 *   invoice  from an approved estimate: the same seed "Convert to invoice" uses (components/forms/signedLock.ts
 *            buildInvoiceSeedFromEstimate: client, lines with their internal costs, tax, discount, design, a link back to
 *            the estimate) on top of the invoice form's own defaults for a new invoice (issue date today, due in 30
 *            days, status Draft, the pay link from Settings), with the next invoice number of the series.
 *   warranty for a completed job: the warranty form's own defaults (1 year, standard coverage and conditions), the
 *            client and address of the job, today as the completion date, and the next warranty number.
 *
 * Both are DRAFTS the user reviews, edits and sends themselves; nothing is sent, signed or billed by a rule.
 */
import { FormType } from '../../types.ts';
import type { UserProfile } from '../../types.ts';
import { buildInvoiceSeedFromEstimate } from '../../components/forms/signedLock.ts';
import { addDaysISO, blankLineItem, DOC_NUMBER_CONFIG, nextDocumentNumber } from '../../components/forms/formUtils.ts';
import { docLabel } from '../notifications/model.ts';

export type DraftProfile = Partial<Pick<UserProfile, 'companyName' | 'address' | 'phone' | 'website' | 'logoUrl' | 'payLinkDefault' | 'payLinkLabel'>>;

export interface JobFacts {
    id: string;
    name?: string | null;
    clientName?: string | null;
    clientAddress?: string | null;
}

export interface BuiltDraft {
    formType: FormType;
    data: Record<string, unknown>;
    number: string;
    /** "Invoice INV-2026-11-004" */
    label: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).trim();

/**
 * The invoice draft for an approved estimate. `estimateData` is the estimate's `data`; `taken` every invoice number
 * already used (the new number is unique against them).
 */
export const buildInvoiceDraft = (args: {
    estimateId: string;
    estimateData: unknown;
    job: JobFacts;
    profile?: DraftProfile | null;
    today: string;
    taken: Iterable<string | null | undefined>;
    now?: Date;
}): BuiltDraft => {
    const p = args.profile || {};
    const seed = buildInvoiceSeedFromEstimate(args.estimateData, args.estimateId);
    const defaults: Record<string, unknown> = {
        title: '', invoiceNumber: '', issueDate: args.today, dueDate: addDaysISO(30, args.today), status: 'Draft', lineItems: [blankLineItem()],
        isProgressBilling: false, discount: 0, taxRate: 0, shipping: 0, notes: 'Thank you for your business.',
        paypalLink: p.payLinkDefault || '', ...(p.payLinkDefault && p.payLinkLabel ? { payLinkLabel: p.payLinkLabel } : {}),
        recurrence: { enabled: false, frequency: 'Monthly' },
        clientName: s(args.job.clientName), clientAddress: s(args.job.clientAddress),
        companyName: p.companyName || '', companyAddress: p.address || '', companyPhone: p.phone || '', companyWebsite: p.website || '', logoUrl: p.logoUrl || '',
    };
    // the estimate's own values win over the empty defaults, but an empty estimate field never blanks a default
    const data: Record<string, unknown> = { ...defaults };
    for (const [k, v] of Object.entries(seed)) if (v !== '' && v !== null && v !== undefined) data[k] = v;
    const cfg = DOC_NUMBER_CONFIG[FormType.Invoice] as { field: string; prefix: string };
    const number = nextDocumentNumber(cfg.prefix, args.taken, args.now || new Date());
    data[cfg.field] = number;
    data.status = 'Draft';
    return { formType: FormType.Invoice, data, number, label: docLabel({ type: 'Invoice', number, title: null }) };
};

/** The warranty draft for a completed job. */
export const buildWarrantyDraft = (args: {
    job: JobFacts;
    profile?: DraftProfile | null;
    today: string;
    taken: Iterable<string | null | undefined>;
    now?: Date;
}): BuiltDraft => {
    const p = args.profile || {};
    const cfg = DOC_NUMBER_CONFIG[FormType.Warranty] as { field: string; prefix: string };
    const number = nextDocumentNumber(cfg.prefix, args.taken, args.now || new Date());
    const data: Record<string, unknown> = {
        title: '', warrantyNumber: number, clientName: s(args.job.clientName), projectAddress: s(args.job.clientAddress), completedDate: args.today,
        duration: '1 Year',
        coverage: 'This warranty covers defects in workmanship and materials provided by the contractor for the duration specified above. We will repair or replace any defective work at no cost to the owner.',
        conditions: 'This warranty does not cover damage resulting from normal wear and tear, negligence, abuse, natural disasters, or modifications made by others. Notification of any defect must be made in writing within the warranty period.',
        signatureUrl: '', logoUrl: p.logoUrl || '',
    };
    return { formType: FormType.Warranty, data, number, label: docLabel({ type: 'Warranty', number, title: null }) };
};
