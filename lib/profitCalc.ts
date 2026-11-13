/**
 * Profit calculator math (components/ProfitCalculatorView.tsx). Pure, so scripts/profit-calc-check.ts can test it.
 * Same calculations as the old app (git 25ae5cc components/ProfitCalculatorView.tsx):
 *   profit = price − cost; margin = profit ÷ price; markup = profit ÷ cost;
 *   Advanced: Target Margin → price = cost ÷ (1 − margin); Tax / VAT on the price (never changes the profit),
 *   Total w/ Tax = price + tax.
 */
import { roundMoney, toNumber } from '../utils/money.ts';
import type { ProfitCalcItem } from './userDataSync.ts';

export type CalcMode = 'simple' | 'advanced';

/** Old app defaults: Target Margin 30%, VAT 20%. */
export const DEFAULT_TARGET_MARGIN = 30;
export const DEFAULT_TAX_RATE = 20;

/** Margin = profit / revenue, markup = profit / cost. Tax only when it is on. */
export const profitSummary = (items: ProfitCalcItem[], taxEnabled: boolean, taxRate: number) => {
    const totalCost = roundMoney(items.reduce((s, i) => s + toNumber(i.cost), 0));
    const totalCharge = roundMoney(items.reduce((s, i) => s + toNumber(i.charge), 0));
    const profit = roundMoney(totalCharge - totalCost);
    const margin = totalCharge > 0 ? (profit / totalCharge) * 100 : 0;
    const markup = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const taxAmount = taxEnabled ? roundMoney(totalCharge * (Math.min(100, Math.max(0, toNumber(taxRate))) / 100)) : 0;
    return { totalCost, totalCharge, profit, margin, markup, taxAmount, totalWithTax: roundMoney(totalCharge + taxAmount) };
};

/** Price that yields `marginPct` on `cost` (0 ≤ margin < 100). */
export const priceForMargin = (cost: number, marginPct: number) => roundMoney(toNumber(cost) / (1 - marginPct / 100));

/** Checks a target margin before pricing; the problem in words, or null. */
export const targetMarginError = (value: number): string | null =>
    (!Number.isFinite(value) || value < 0 || value >= 100 ? 'Enter a margin from 0 to 99.9%.' : null);

/** "Calculate Pricing": every line with a cost gets the price for the target margin; lines without a cost keep theirs. */
export const applyTargetMargin = (items: ProfitCalcItem[], marginPct: number): ProfitCalcItem[] =>
    items.map((i) => (toNumber(i.cost) > 0 ? { ...i, charge: priceForMargin(i.cost, marginPct) } : i));

/**
 * Same bands as the old app's summary colors: 30% and up green, 15% amber, red below. Judged on the margin as shown
 * (one decimal), so prices rounded to the cent by "Calculate pricing" for 30% (29.9997%) count as 30%.
 */
export const marginHealth = (rawMargin: number, hasRevenue: boolean): { label: string; tone: 'muted' | 'danger' | 'warning' | 'success' } => {
    const margin = Math.round(rawMargin * 10) / 10;
    if (!hasRevenue) return { label: 'Enter your prices', tone: 'muted' };
    if (margin < 0) return { label: 'Loss', tone: 'danger' };
    if (margin < 15) return { label: 'Low margin', tone: 'danger' };
    if (margin < 30) return { label: 'Thin margin', tone: 'warning' };
    return { label: 'Healthy margin', tone: 'success' };
};
