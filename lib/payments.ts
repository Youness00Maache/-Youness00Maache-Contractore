/**
 * "Get paid" without a payment processor (NEXT_STEPS 0c.1, competitor gaps #2, #3, #7): pure helpers, no network.
 *
 *  - Pay now: the contractor's OWN payment page (PayPal.me, Square, Venmo, Stripe Payment Link, bank page). The app
 *    never touches the money; it shows the right amount (deposit / progress / balance due) next to the link and fills
 *    it into links that accept an amount in the URL (PayPal.me, Cash App).
 *  - "I've paid": the client's report (documents.payment_reported_*, mirrored into data.paymentReported*).
 *  - Mark as paid: the invoice patch + the Receipt it creates (lib/finance.ts then counts it as Collected).
 *  - Financing: the contractor's financing partner link on estimates from a chosen amount.
 * Database calls live in lib/paymentsApi.ts. Tested by scripts/payments-qa.ts.
 */
import { computeDocumentTotals, roundMoney, toNumber } from '../utils/money.ts';
import type { InvoiceData, InvoicePayment, Job, ReceiptData, UserProfile } from '../types.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

/** Suggestions for the "shown as" name of the pay link. */
export const PAY_SERVICES = ['PayPal', 'Venmo', 'Square', 'Stripe', 'Cash App', 'Zelle', 'Bank transfer'] as const;

/** A safe https link (no javascript:, no plain http: client pages and QR codes only use https), else ''. */
export const httpsLink = (value: unknown): string => {
    const v = str(value);
    if (!/^https:\/\/[^\s<>"'`\\]+$/i.test(v)) return '';
    try {
        const u = new URL(v);
        return u.protocol === 'https:' && /\.[a-z]{2,}$/i.test(u.hostname) ? v : '';
    } catch {
        return '';
    }
};

/** "paypal.me/acme" → "https://paypal.me/acme"; returns '' for anything that isn't a web address. */
export const normalizeHttpsUrl = (value: unknown): string => {
    const v = str(value);
    if (!v) return '';
    if (/^http:\/\//i.test(v)) return httpsLink(v.replace(/^http:/i, 'https:'));
    if (/^https:\/\//i.test(v)) return httpsLink(v);
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#]\S*)?$/i.test(v)) return httpsLink(`https://${v}`);
    return '';
};

const hostOf = (url: string): string => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

/** Name of the payment service: the contractor's label, else guessed from the link ("" when unknown). */
export const payServiceName = (url: string, label?: unknown): string => {
    const named = str(label).replace(/\s+/g, ' ');
    if (named) return named.slice(0, 40);
    const host = hostOf(url);
    if (/(^|\.)paypal\.(me|com)$/.test(host)) return 'PayPal';
    if (/(^|\.)venmo\.com$/.test(host)) return 'Venmo';
    if (/(^|\.)(square\.link|squareup\.com|square\.site)$/.test(host)) return 'Square';
    if (/(^|\.)stripe\.com$/.test(host)) return 'Stripe';
    if (/(^|\.)cash\.app$/.test(host)) return 'Cash App';
    return '';
};

const CLOSED = /^(paid|cancel+ed|void)$/i;
/** Invoices a client can still pay (anything but Paid / Cancelled / Void). */
export const isPayableStatus = (status: unknown): boolean => !CLOSED.test(str(status));
/** "Mark as paid" is offered on Draft, Sent and Overdue invoices. */
export const canMarkPaid = (status: unknown): boolean => isPayableStatus(status);

export type PayAmountKind = 'balance' | 'progress' | 'deposit' | 'total' | 'paid';
export interface PayAmount {
    amount: number;
    kind: PayAmountKind;
    /** "Balance due", "Progress payment due", "Deposit due", "Amount due" */
    label: string;
}

/** What the client should pay now: what is still due, named after the kind of invoice it is. */
export const payAmountOf = (d: any): PayAmount => {
    if (/^paid$/i.test(str(d?.status))) return { amount: 0, kind: 'paid', label: 'Paid' };
    const t = computeDocumentTotals(d || {});
    const amount = t.balanceDue;
    if (d?.isProgressBilling) return { amount, kind: 'progress', label: 'Progress payment due' };
    if (t.amountPaid > 0) return { amount, kind: 'balance', label: 'Balance due' };
    const lines = (Array.isArray(d?.lineItems) ? d.lineItems : []).filter((li: any) => li && (str(li.description) || toNumber(li.rate)));
    const isDeposit = /\bdeposit\b/i.test(str(d?.title)) || (lines.length > 0 && lines.every((li: any) => /\bdeposit\b/i.test(str(li.description))));
    if (isDeposit) return { amount, kind: 'deposit', label: 'Deposit due' };
    return { amount, kind: 'total', label: 'Amount due' };
};

/**
 * Fills the amount into links that take it in the URL (PayPal.me, paypal.com/paypalme, Cash App), only when the link
 * has no amount yet. Every other link is returned unchanged (the amount is shown on the button instead).
 */
export const payUrlWithAmount = (url: string, amount: number, currency?: unknown): string => {
    const link = httpsLink(url);
    if (!link || !(amount > 0)) return link;
    let u: URL;
    try { u = new URL(link); } catch { return link; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const segs = u.pathname.split('/').filter(Boolean);
    const amt = roundMoney(amount).toFixed(2);
    const cur = str(currency).toUpperCase();
    // PayPal.me uses the account's own currency unless one is written after the amount ("250EUR")
    const curSuffix = /^[A-Z]{3}$/.test(cur) && cur !== 'USD' ? cur : '';
    if (host === 'paypal.me' && segs.length === 1) u.pathname = `/${segs[0]}/${amt}${curSuffix}`;
    else if (host === 'paypal.com' && segs.length === 2 && segs[0].toLowerCase() === 'paypalme') u.pathname = `/paypalme/${segs[1]}/${amt}${curSuffix}`;
    else if (host === 'cash.app' && segs.length === 1 && segs[0].startsWith('$') && !curSuffix) u.pathname = `/${segs[0]}/${amt}`;
    else return link;
    return u.toString();
};

export interface PayLinkInfo {
    /** the link as the contractor typed it */
    url: string;
    /** the link to open (amount filled in when the service supports it) */
    href: string;
    service: string;
    /** "Pay now" / "Pay now with PayPal" */
    buttonLabel: string;
    amount: number;
    amountLabel: string;
    kind: PayAmountKind;
}

/** Everything a "Pay now" button needs, or null when there is no https pay link or nothing is due. */
export const payLinkFor = (d: any): PayLinkInfo | null => {
    const url = httpsLink(d?.paypalLink);
    if (!url || !isPayableStatus(d?.status)) return null;
    const due = payAmountOf(d);
    if (!(due.amount > 0)) return null;
    const service = payServiceName(url, d?.payLinkLabel);
    return {
        url,
        href: payUrlWithAmount(url, due.amount, d?.currency),
        service,
        buttonLabel: service ? `Pay now with ${service}` : 'Pay now',
        amount: due.amount,
        amountLabel: due.label,
        kind: due.kind,
    };
};

// ---------------------------------------------------------------------------------------------------------------
// "I've paid" (client report)
// ---------------------------------------------------------------------------------------------------------------
export interface PaymentReport {
    at: string;
    note: string;
    amount: number | null;
}

/** The client's "I've paid" report on an invoice that is not marked paid yet, else null. */
export const paymentReportOf = (d: any): PaymentReport | null => {
    const at = str(d?.paymentReportedAt);
    if (!at || !isPayableStatus(d?.status)) return null;
    const amount = toNumber(d?.paymentReportAmount);
    return { at, note: str(d?.paymentReportNote).slice(0, 500), amount: amount > 0 ? roundMoney(amount) : null };
};

/** Data without the report keys (the database removes them too when the report is cleared). */
export const withoutPaymentReport = <T extends Record<string, any>>(d: T): T => {
    const { paymentReportedAt: _a, paymentReportNote: _b, paymentReportAmount: _c, ...rest } = d || ({} as T);
    return rest as T;
};

/** Clean note for the RPC: one line, at most 500 characters. */
export const cleanReportNote = (note: unknown): string => str(note).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 500);

// ---------------------------------------------------------------------------------------------------------------
// Mark as paid
// ---------------------------------------------------------------------------------------------------------------
export interface MarkPaidInput {
    amount: number;
    /** YYYY-MM-DD */
    date: string;
    method: string;
    /** private note, kept on the receipt only (never on the invoice the client can see) */
    note?: string;
}

/** Suggested method: the client's own words first ("PayPal, Nov 14" → "PayPal"), else the pay link's service. */
export const suggestedPaymentMethod = (d: any): string => {
    const note = str(d?.paymentReportNote);
    const known = ['PayPal', 'Venmo', 'Zelle', 'Cash App', 'Square', 'Stripe', 'Check', 'Cash', 'Bank transfer', 'Wire', 'ACH', 'Credit card', 'Card'];
    const hit = known.find((k) => new RegExp(`\\b${k.replace(/\s+/g, '\\s*')}\\b`, 'i').test(note));
    if (hit) return hit === 'Card' ? 'Credit Card' : hit === 'Credit card' ? 'Credit Card' : hit;
    const url = httpsLink(d?.paypalLink);
    return url ? payServiceName(url, d?.payLinkLabel) : '';
};

/** What "Mark as paid" suggests: everything still due (or what the client said they paid, when less). */
export const suggestedPaymentAmount = (d: any): number => {
    const due = computeDocumentTotals(d || {}).balanceDue;
    const reported = toNumber(d?.paymentReportAmount);
    return roundMoney(reported > 0 && reported < due ? reported : due);
};

export interface MarkPaidResult {
    data: InvoiceData;
    paidInFull: boolean;
    /** still owed after this payment */
    balanceAfter: number;
    payment: InvoicePayment;
}

/**
 * The invoice after a payment: amountPaid raised (capped at the total), status Paid when nothing is left (a Draft
 * with a part payment becomes Sent so job financials count it), the payment added to `payments`, the client's report
 * cleared. Paid in full also sets amountPaid = total, so the PDF prints "Balance due $0.00".
 */
export const applyPayment = (
    d: InvoiceData,
    input: MarkPaidInput,
    ids: { paymentId: string; receiptId?: string; receiptNumber?: string; now?: Date },
): MarkPaidResult => {
    const t = computeDocumentTotals(d);
    const alreadyPaid = /^paid$/i.test(str(d.status)) && !(t.amountPaid > 0) ? t.total : t.amountPaid;
    const amount = roundMoney(Math.max(0, toNumber(input.amount)));
    const newPaid = roundMoney(Math.min(t.total, alreadyPaid + amount));
    const balanceAfter = roundMoney(Math.max(0, t.total - newPaid));
    const paidInFull = balanceAfter <= 0;
    const payment: InvoicePayment = {
        id: ids.paymentId,
        amount,
        date: input.date,
        ...(str(input.method) ? { method: str(input.method).slice(0, 80) } : {}),
        ...(ids.receiptId ? { receiptId: ids.receiptId } : {}),
        ...(ids.receiptNumber ? { receiptNumber: ids.receiptNumber } : {}),
        recordedAt: (ids.now || new Date()).toISOString(),
    };
    const base = withoutPaymentReport(d as InvoiceData & Record<string, any>);
    const status: InvoiceData['status'] = paidInFull ? 'Paid' : (str(d.status) === 'Draft' || !str(d.status) ? 'Sent' : d.status);
    return {
        data: {
            ...base,
            amountPaid: newPaid,
            status,
            ...(paidInFull ? { paidAt: input.date } : {}),
            payments: [...(Array.isArray(d.payments) ? d.payments : []), payment],
        },
        paidInFull,
        balanceAfter,
        payment,
    };
};

/** The Receipt "Mark as paid" creates (linked to the invoice by id AND number, like the Receipt form's picker). */
export const buildPaymentReceipt = (
    inv: InvoiceData,
    invoiceId: string,
    input: MarkPaidInput,
    receiptNumber: string,
    profile: Partial<UserProfile> | null | undefined,
    job?: Partial<Job> | null,
    paidInFull = true,
): ReceiptData => {
    const p = profile || {};
    const number = str(inv.invoiceNumber);
    const note = str(input.note);
    return {
        title: '',
        receiptNumber,
        date: input.date,
        clientName: str(inv.clientName) || str(job?.clientName),
        clientAddress: str(inv.clientAddress) || (str(inv.clientName) && str(inv.clientName) !== str(job?.clientName) ? '' : str(job?.clientAddress)),
        amount: roundMoney(Math.max(0, toNumber(input.amount))),
        description: [number ? `Payment for invoice ${number}` : 'Payment received', note].filter(Boolean).join('\n'),
        paymentMethod: str(input.method),
        paymentStatus: paidInFull ? 'Paid in full' : 'Partial payment',
        invoiceId,
        ...(number ? { invoiceNumber: number } : {}),
        companyName: str(inv.companyName) || str(p.companyName),
        companyAddress: str(inv.companyAddress) || str(p.address),
        companyPhone: str(inv.companyPhone) || str(p.phone),
        companyWebsite: str(inv.companyWebsite) || str(p.website),
        logoUrl: str(inv.logoUrl) || str(p.logoUrl),
        signatureUrl: '',
        ...(inv.templateId ? { templateId: inv.templateId } : {}),
        ...(inv.themeColors ? { themeColors: { ...inv.themeColors } } : {}),
        ...(inv.fontFamily ? { fontFamily: inv.fontFamily } : {}),
        ...(inv.paperSize ? { paperSize: inv.paperSize } : {}),
    };
};

/** Validation message for the Mark as paid form, or null. */
export const markPaidProblem = (input: MarkPaidInput): string | null => {
    if (!(toNumber(input.amount) > 0)) return 'Enter the amount you received.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(input.date))) return 'Choose the date you were paid.';
    return null;
};

// ---------------------------------------------------------------------------------------------------------------
// Financing link on estimates
// ---------------------------------------------------------------------------------------------------------------
export interface FinancingInfo {
    url: string;
    minAmount: number;
    total: number;
}

/** The financing link to show on an estimate (https link set and total at least the minimum), else null. */
export const financingFor = (d: any): FinancingInfo | null => {
    const url = httpsLink(d?.financingLink);
    if (!url || /^(rejected|declined)$/i.test(str(d?.status))) return null;
    const total = computeDocumentTotals(d || {}).total;
    const minAmount = roundMoney(Math.max(0, toNumber(d?.financingMinAmount)));
    if (!(total > 0) || total < minAmount) return null;
    return { url, minAmount, total };
};

// ---------------------------------------------------------------------------------------------------------------
// Profile settings (profiles.default_pay_link …)
// ---------------------------------------------------------------------------------------------------------------
export interface PaymentSettings {
    payLinkDefault: string;
    payLinkLabel: string;
    financingLink: string;
    financingMinAmount: number;
    googleReviewLink: string;
    reviewAutoSend: boolean;
}

export const PAYMENT_PROFILE_COLUMNS = [
    'default_pay_link', 'default_pay_link_label', 'financing_link', 'financing_min_amount', 'google_review_link', 'review_auto_send',
] as const;

export const mapPaymentSettings = (row: any): PaymentSettings => ({
    payLinkDefault: str(row?.default_pay_link),
    payLinkLabel: str(row?.default_pay_link_label),
    financingLink: str(row?.financing_link),
    financingMinAmount: row?.financing_min_amount != null ? roundMoney(Math.max(0, toNumber(row.financing_min_amount))) : 0,
    googleReviewLink: str(row?.google_review_link),
    reviewAutoSend: row?.review_auto_send === true,
});

export const paymentSettingsOf = (p: Partial<UserProfile> | null | undefined): PaymentSettings => ({
    payLinkDefault: str(p?.payLinkDefault),
    payLinkLabel: str(p?.payLinkLabel),
    financingLink: str(p?.financingLink),
    financingMinAmount: roundMoney(Math.max(0, toNumber(p?.financingMinAmount))),
    googleReviewLink: str(p?.googleReviewLink),
    reviewAutoSend: p?.reviewAutoSend === true,
});

/** First problem with the settings (links must be https web addresses), or null. */
export const paymentSettingsProblem = (s: PaymentSettings): string | null => {
    if (str(s.payLinkDefault) && !normalizeHttpsUrl(s.payLinkDefault)) return 'The "Pay now" link must be a web address (https://…).';
    if (str(s.financingLink) && !normalizeHttpsUrl(s.financingLink)) return 'The financing link must be a web address (https://…).';
    if (str(s.googleReviewLink) && !normalizeHttpsUrl(s.googleReviewLink)) return 'The Google review link must be a web address (https://…).';
    if (toNumber(s.financingMinAmount) < 0) return 'The financing amount can’t be negative.';
    return null;
};

/** The database row for the settings (links normalized to https, empty values stored as null). */
export const paymentSettingsRow = (s: PaymentSettings) => ({
    default_pay_link: normalizeHttpsUrl(s.payLinkDefault) || null,
    default_pay_link_label: str(s.payLinkLabel).slice(0, 60) || null,
    financing_link: normalizeHttpsUrl(s.financingLink) || null,
    financing_min_amount: toNumber(s.financingMinAmount) > 0 ? roundMoney(toNumber(s.financingMinAmount)) : null,
    google_review_link: normalizeHttpsUrl(s.googleReviewLink) || null,
    review_auto_send: Boolean(s.reviewAutoSend),
});

export const samePaymentSettings = (a: PaymentSettings, b: PaymentSettings): boolean =>
    JSON.stringify(paymentSettingsRow(a)) === JSON.stringify(paymentSettingsRow(b));
