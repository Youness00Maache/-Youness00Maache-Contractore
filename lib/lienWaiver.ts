/**
 * Lien waivers (competitor gap #17, part 1): conditional or unconditional, on a progress or a final payment, filled in
 * from the job, its invoice and the payment recorded with "Mark as paid", and saved on the job as a Note document
 * (same header, footer and PDF as every document; it can be emailed and shared like one). Pure, no React / Supabase
 * (scripts/field-features-check.ts).
 *
 * The wording is a general form, not any state's statutory text: several US states (California, Texas, Florida,
 * Georgia, Arizona, Utah, Nevada, Wyoming, Mississippi, Missouri, Michigan, Massachusetts…) prescribe their own form.
 * The document says so and the app shows it before creating one.
 */
import { esc } from '../utils/escapeHtml.ts';
import { computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';

export type WaiverType = 'conditional' | 'unconditional';
export type WaiverScope = 'progress' | 'final';

export interface LienWaiverFields {
    type: WaiverType;
    scope: WaiverScope;
    /** the contractor waiving its lien rights (the company) */
    claimant: string;
    /** who the work was for (the client) */
    customer: string;
    /** property owner */
    owner: string;
    /** who pays (maker of the check) */
    maker: string;
    jobName: string;
    jobLocation: string;
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    /** progress: work covered through this day (YYYY-MM-DD) */
    throughDate: string;
    /** day the payment was received (YYYY-MM-DD) */
    paymentDate: string;
    paymentMethod: string;
    /** progress: what this release does not cover (retention, unpaid extras…) */
    exceptions: string;
    /** final: disputed claims for extra work */
    disputedAmount: number;
    signerName: string;
    signerTitle: string;
    /** date signed (YYYY-MM-DD) */
    signedOn: string;
    /** the contractor's saved signature (data:image… URL), or '' for a signature line */
    signatureDataUrl: string;
}

export const WAIVER_TAG = 'Lien waiver';

export const lienWaiverTitle = (type: WaiverType, scope: WaiverScope): string =>
    `${type === 'conditional' ? 'Conditional' : 'Unconditional'} Waiver and Release on ${scope === 'progress' ? 'Progress' : 'Final'} Payment`;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const ymd = (v: unknown): string => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v)); return m ? m[1] : ''; };

export interface WaiverInvoice {
    id: string;
    number: string;
    total: number;
    paid: number;
    issueDate: string;
    status: string;
    payments: Array<{ id: string; amount: number; date: string; method: string }>;
}

/** The job's invoices as the waiver window lists them (newest first), with their payments. */
export const waiverInvoices = (forms: ReadonlyArray<{ id: string; type: string; data?: any; createdAt?: string }>): WaiverInvoice[] =>
    forms
        .filter(f => String(f.type) === 'Invoice' && f.data)
        .map(f => {
            const d = f.data || {};
            const totals = computeDocumentTotals(d);
            const payments = (Array.isArray(d.payments) ? d.payments : [])
                .filter((p: any) => p && toNumber(p.amount) > 0)
                .map((p: any) => ({ id: str(p.id) || `${ymd(p.date)}-${toNumber(p.amount)}`, amount: roundMoney(toNumber(p.amount)), date: ymd(p.date), method: str(p.method) }));
            return {
                id: f.id, number: str(d.invoiceNumber), total: totals.total, paid: totals.amountPaid || roundMoney(payments.reduce((n: number, p: { amount: number }) => n + p.amount, 0)),
                issueDate: ymd(d.issueDate) || ymd(f.createdAt), status: str(d.status), payments,
            };
        })
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

/**
 * Fields filled in from what the app knows. A payment (from "Mark as paid") gives the amount and dates; without one a
 * progress waiver uses the invoice total and date, a final waiver the invoice total.
 */
export const waiverPrefill = (input: {
    type: WaiverType;
    scope: WaiverScope;
    job: { name?: string; clientName?: string; clientAddress?: string };
    client?: { name?: string; address?: string } | null;
    profile?: { companyName?: string; name?: string; defaultSignatureUrl?: string } | null;
    invoice?: WaiverInvoice | null;
    paymentId?: string | null;
    today: string;
}): LienWaiverFields => {
    const inv = input.invoice || null;
    const pay = inv ? (inv.payments.find(p => p.id === input.paymentId) || (input.paymentId === undefined ? inv.payments[inv.payments.length - 1] : undefined) || null) : null;
    const clientName = str(input.client?.name) || str(input.job.clientName);
    // paymentId undefined = the latest payment; null = none (a conditional waiver sent before the money arrives)
    const amount = pay ? pay.amount : inv ? inv.total : 0;
    const sig = str(input.profile?.defaultSignatureUrl);
    return {
        type: input.type,
        scope: input.scope,
        claimant: str(input.profile?.companyName) || str(input.profile?.name),
        customer: clientName,
        owner: clientName,
        maker: clientName,
        jobName: str(input.job.name),
        jobLocation: str(input.job.clientAddress) || str(input.client?.address),
        invoiceId: inv?.id || '',
        invoiceNumber: inv?.number || '',
        amount: roundMoney(amount),
        throughDate: input.scope === 'progress' ? (pay?.date || inv?.issueDate || input.today) : '',
        paymentDate: pay?.date || '',
        paymentMethod: pay?.method || '',
        exceptions: '',
        disputedAmount: 0,
        signerName: str(input.profile?.name),
        signerTitle: 'Owner',
        signedOn: input.today,
        signatureDataUrl: /^data:image\/(png|jpe?g|webp);base64,/i.test(sig) ? sig : '',
    };
};

/** Problems that stop creating the waiver (empty = fine), and warnings shown before it is created. */
export const waiverCheck = (f: LienWaiverFields): { problems: string[]; warnings: string[] } => {
    const problems: string[] = [];
    const warnings: string[] = [];
    if (!f.claimant) problems.push('Add your company name (Settings › Company).');
    if (!f.customer) problems.push('Add who the work was for.');
    if (!f.jobLocation) problems.push('Add the job address.');
    if (!(f.amount > 0)) problems.push('Add the payment amount.');
    if (f.scope === 'progress' && !ymd(f.throughDate)) problems.push('Add the date the work is covered through.');
    if (f.type === 'unconditional' && !ymd(f.paymentDate)) warnings.push('An unconditional waiver says you have been paid. Only send it once the payment has cleared.');
    if (f.type === 'unconditional' && f.paymentDate && f.signedOn && f.paymentDate > f.signedOn) warnings.push('The payment date is after the signing date.');
    return { problems, warnings };
};

const fmtDate = (v: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** Body of the waiver Note (every value escaped). */
export const buildLienWaiverHtml = (f: LienWaiverFields): string => {
    const b = (v: string) => `<strong>${esc(v || '________________')}</strong>`;
    const amount = b(formatMoney(f.amount));
    const through = b(fmtDate(f.throughDate));
    const location = b(f.jobLocation);
    const owner = b(f.owner || f.customer);
    const customer = b(f.customer);
    const claimant = b(f.claimant);
    const rows: Array<[string, string]> = [
        ['Claimant', f.claimant], ['Customer', f.customer], ['Owner', f.owner], ['Job', f.jobName], ['Job location', f.jobLocation],
        ['Invoice', f.invoiceNumber], ['Payment amount', formatMoney(f.amount)], ['Maker of the payment', f.maker],
        ...(f.scope === 'progress' ? [['Work through', fmtDate(f.throughDate)] as [string, string]] : []),
        ...(f.paymentDate ? [['Payment received', `${fmtDate(f.paymentDate)}${f.paymentMethod ? ` (${f.paymentMethod})` : ''}`] as [string, string]] : []),
    ];
    const parts: string[] = [];
    parts.push(`<h2>${esc(lienWaiverTitle(f.type, f.scope))}</h2>`);
    parts.push(`<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;"><tbody>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding: 3px 6px; width: 32%; color: #475569;">${esc(k)}</td><td style="padding: 3px 6px; font-weight: 600;">${esc(v)}</td></tr>`).join('')}</tbody></table>`);

    if (f.type === 'conditional') {
        parts.push(`<p>This document waives and releases lien, stop payment notice and payment bond rights effective on receipt of payment. When ${claimant} has received a payment from ${b(f.maker || f.customer)} in the sum of ${amount}, and the payment has been properly endorsed and has cleared the bank on which it is drawn, this document becomes effective to release any mechanic’s lien, stop payment notice or bond right ${claimant} has on the job of ${owner} located at ${location}${f.scope === 'progress' ? `, for labor, services, equipment or material furnished to ${customer} through ${through} only` : `. This is the final payment to the claimant for all labor, services, equipment or material furnished on this job`}.</p>`);
    } else {
        parts.push(`<p>${claimant} has been paid and has received ${f.scope === 'progress' ? `a progress payment in the sum of ${amount} for labor, services, equipment or material furnished to ${customer}` : `payment in full, ${amount}, for all labor, services, equipment or material furnished to ${customer}`} on the job of ${owner} located at ${location}, and therefore waives and releases any mechanic’s lien, stop payment notice or bond right on that job${f.scope === 'progress' ? ` through ${through} only` : ''}.</p>`);
    }
    if (f.scope === 'progress') {
        parts.push(`<p>This release covers the payment above only. It does not cover retention, extra work or changes not yet paid, or labor, services, equipment or material furnished after ${through}, and does not affect the claimant’s right to be paid for them.${f.exceptions ? ` Exceptions: ${esc(f.exceptions)}.` : ''}</p>`);
    } else {
        parts.push(`<p>Exceptions: ${f.disputedAmount > 0 ? `disputed claims for extra work in the amount of ${b(formatMoney(f.disputedAmount))}` : 'none'}.</p>`);
    }
    if (f.type === 'unconditional') {
        parts.push('<p><strong>Notice:</strong> this document waives rights unconditionally and states that you have been paid. Do not sign it if you have not been paid.</p>');
    }

    const sig = f.signatureDataUrl && /^data:image\/(png|jpe?g|webp);base64,/i.test(f.signatureDataUrl)
        ? `<img src="${esc(f.signatureDataUrl)}" alt="Signature" style="height: 56px; max-width: 240px;" />`
        : '<p style="margin-top: 28px;">______________________________</p>';
    parts.push(`<table style="width: 100%; border-collapse: collapse; margin-top: 16px;"><tbody><tr><td style="width: 55%; vertical-align: bottom; padding: 4px 6px;">${sig}<p style="font-size: 12px; color: #475569;">Signature of the claimant</p></td><td style="vertical-align: bottom; padding: 4px 6px;"><p>${esc(f.signerName || '')}${f.signerTitle ? `, ${esc(f.signerTitle)}` : ''}</p><p>${esc(f.claimant)}</p><p>Date: ${esc(fmtDate(f.signedOn))}</p></td></tr></tbody></table>`);
    parts.push('<p style="font-size: 11px; color: #64748b; margin-top: 14px;">General form. Some states require their own statutory lien waiver wording; where they do, use that form.</p>');
    return parts.join('');
};
