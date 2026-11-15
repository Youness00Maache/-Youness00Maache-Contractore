// Invoice money for reminders: total and what is still owed.
// computeTotals() is a copy of computeDocumentTotals() in utils/money.ts (edge functions can only import files under
// supabase/functions). scripts/reminders-check.ts compares both on many documents, so they cannot drift apart.

export interface TotalsLineItem {
  quantity?: unknown;
  rate?: unknown;
  percentComplete?: unknown;
  previouslyBilled?: unknown;
  optional?: unknown;
  selected?: unknown;
}

export interface TotalsInput {
  lineItems?: TotalsLineItem[] | null;
  taxRate?: unknown;
  discount?: unknown;
  shipping?: unknown;
  isProgressBilling?: unknown;
  amountPaid?: unknown;
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxRate: number;
  tax: number;
  shipping: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export const roundMoney = (value: number): number => {
  const n = toNumber(value);
  if (n === 0) return 0;
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  return cents === 0 ? 0 : (Math.sign(n) * cents) / 100;
};

const flag = (v: unknown) => v === true || String(v ?? '').trim().toLowerCase() === 'true';

const lineAmount = (item: TotalsLineItem | null | undefined, progress: boolean): number => {
  if (!item) return 0;
  // optional add-on not selected (utils/money.ts isExcludedOptionalLine): printed, never counted
  if (flag(item.optional) && !flag(item.selected)) return 0;
  const scheduled = toNumber(item.quantity) * toNumber(item.rate);
  if (!progress) return roundMoney(scheduled);
  const pct = Math.min(100, Math.max(0, toNumber(item.percentComplete)));
  return roundMoney(Math.max(0, scheduled * (pct / 100) - toNumber(item.previouslyBilled)));
};

export function computeTotals(doc: TotalsInput | null | undefined): Totals {
  const items = Array.isArray(doc?.lineItems) ? doc!.lineItems! : [];
  const progress = flag(doc?.isProgressBilling);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + lineAmount(item, progress), 0));
  const discount = roundMoney(Math.min(Math.max(0, toNumber(doc?.discount)), Math.max(0, subtotal)));
  const taxableAmount = roundMoney(subtotal - discount);
  const taxRate = Math.max(0, toNumber(doc?.taxRate));
  const tax = roundMoney(taxableAmount * (taxRate / 100));
  const shipping = roundMoney(Math.max(0, toNumber(doc?.shipping)));
  const total = roundMoney(taxableAmount + tax + shipping);
  const amountPaid = roundMoney(Math.max(0, toNumber(doc?.amountPaid)));
  const balanceDue = roundMoney(Math.max(0, total - amountPaid));
  return { subtotal, discount, taxableAmount, taxRate, tax, shipping, total, amountPaid, balanceDue };
}

export interface PaymentReceipt {
  jobId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: unknown;
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Receipts that pay this invoice: linked by id, or by invoice number on the same job. */
export function receiptsForInvoice(
  invoice: { id: string; jobId?: string | null; invoiceNumber?: string | null },
  receipts: PaymentReceipt[],
): number {
  let sum = 0;
  for (const r of receipts) {
    const byId = !!r.invoiceId && r.invoiceId === invoice.id;
    const byNumber = !r.invoiceId && !!String(invoice.invoiceNumber ?? '').trim() && same(r.invoiceNumber, invoice.invoiceNumber)
      && (!r.jobId || !invoice.jobId || r.jobId === invoice.jobId);
    if (byId || byNumber) sum += Math.max(0, toNumber(r.amount));
  }
  return roundMoney(sum);
}

/**
 * What the client still owes: total − what was paid. "Paid" is the largest of the invoice's amount paid, the
 * payments recorded with "Mark as paid" (data.payments) and the receipts written for it (the same payment is often
 * recorded in more than one place, so they are not added together).
 */
export function invoiceBalance(
  doc: TotalsInput & { payments?: Array<{ amount?: unknown } | null> | null },
  receiptsTotal = 0,
): { total: number; paid: number; balanceDue: number } {
  const totals = computeTotals(doc);
  const recorded = Array.isArray(doc.payments)
    ? roundMoney(doc.payments.reduce((s, p) => s + Math.max(0, toNumber(p?.amount)), 0))
    : 0;
  const paid = roundMoney(Math.min(totals.total, Math.max(totals.amountPaid, recorded, receiptsTotal)));
  return { total: totals.total, paid, balanceDue: roundMoney(Math.max(0, totals.total - paid)) };
}

export function formatMoney(value: unknown, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD' }).format(roundMoney(toNumber(value)));
  } catch {
    return `$${roundMoney(toNumber(value)).toFixed(2)}`;
  }
}
