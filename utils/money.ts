/**
 * Single source of truth for document money math.
 * Forms, PDF/HTML templates, the client portal, emails and analytics MUST all use these helpers,
 * so the number on screen is always the number that is printed, emailed and shown to the client.
 */

export interface MoneyLineItem {
  quantity?: number | string | null;
  rate?: number | string | null;
  percentComplete?: number | string | null; // progress billing: cumulative % complete (0-100)
  previouslyBilled?: number | string | null; // progress billing: amount already invoiced for this line
  unitCost?: number | string | null;
}

export interface MoneyDocument {
  lineItems?: MoneyLineItem[] | null;
  taxRate?: number | string | null; // percent, e.g. 8.25
  discount?: number | string | null; // flat amount
  shipping?: number | string | null; // flat amount
  isProgressBilling?: boolean | null;
  amountPaid?: number | string | null; // optional deposits/payments already received
}

export interface DocumentTotals {
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

/** Parses numbers safely: "1,250.50" -> 1250.5, "", null, NaN, undefined -> 0. */
export const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Rounds to cents, half-up (half away from zero: 29.995 → 30.00, −29.995 → −30.00), without floating point drift.
 * Binary noise is removed first: 50% of $99.99 − $20 is 29.994999999999997 in floating point, which must round
 * like the 29.995 it stands for (Number.EPSILON alone is far too small at this magnitude).
 */
export const roundMoney = (value: number): number => {
  const n = toNumber(value);
  if (n === 0) return 0;
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  return cents === 0 ? 0 : (Math.sign(n) * cents) / 100;
};

/** Amount a single line contributes to this document. */
export const lineItemAmount = (item: MoneyLineItem | null | undefined, isProgressBilling = false): number => {
  if (!item) return 0;
  const scheduled = toNumber(item.quantity) * toNumber(item.rate);
  if (!isProgressBilling) return roundMoney(scheduled);
  const pct = Math.min(100, Math.max(0, toNumber(item.percentComplete)));
  const earned = scheduled * (pct / 100);
  return roundMoney(Math.max(0, earned - toNumber(item.previouslyBilled)));
};

/** Full scheduled value of a line (quantity x rate), ignoring progress %. */
export const lineItemScheduledValue = (item: MoneyLineItem | null | undefined): number =>
  roundMoney(toNumber(item?.quantity) * toNumber(item?.rate));

export const computeDocumentTotals = (doc: MoneyDocument | null | undefined): DocumentTotals => {
  const items = Array.isArray(doc?.lineItems) ? doc!.lineItems! : [];
  const isProgress = Boolean(doc?.isProgressBilling);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + lineItemAmount(item, isProgress), 0));
  // never negative, never more than the subtotal (a credit-only change order has a negative subtotal)
  const discount = roundMoney(Math.min(Math.max(0, toNumber(doc?.discount)), Math.max(0, subtotal)));
  const taxableAmount = roundMoney(subtotal - discount);
  const taxRate = Math.max(0, toNumber(doc?.taxRate));
  const tax = roundMoney(taxableAmount * (taxRate / 100));
  const shipping = roundMoney(Math.max(0, toNumber(doc?.shipping)));
  const total = roundMoney(taxableAmount + tax + shipping);
  const amountPaid = roundMoney(Math.max(0, toNumber(doc?.amountPaid)));
  const balanceDue = roundMoney(Math.max(0, total - amountPaid));
  return { subtotal, discount, taxableAmount, taxRate, tax, shipping, total, amountPaid, balanceDue };
};

/** Internal cost of the line items (for profit/margin views). */
export const computeDocumentCost = (doc: MoneyDocument | null | undefined): number => {
  const items = Array.isArray(doc?.lineItems) ? doc!.lineItems! : [];
  return roundMoney(items.reduce((sum, item) => sum + toNumber(item?.quantity) * toNumber(item?.unitCost), 0));
};

export const formatMoney = (value: unknown, currency = 'USD', locale = 'en-US'): string => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD' }).format(roundMoney(toNumber(value)));
  } catch {
    return `$${roundMoney(toNumber(value)).toFixed(2)}`;
  }
};
