/**
 * Pure analytics aggregation for AnalyticsView (owned by VIEWS).
 * All money goes through utils/money.ts so the numbers match forms, PDFs and the portal, and income, collected
 * and profit use the ONE definition in lib/finance.ts (the same one Job financials uses).
 * All dates are LOCAL calendar days ("YYYY-MM-DD"); see utils/localDates.ts.
 */
import { computeDocumentCost, roundMoney } from './money.ts';
import { addDaysLocal, addMonthsClamped, daysBetween, instantToLocalYMD, normalizeYMD, parseLocalDate, toLocalYMD } from './localDates.ts';
import {
  DEFAULT_LABOR_RATE, documentTotals, expenseTotal, invoiceCollected, isBilledInvoiceStatus, isPaidStatus, laborOf, linkReceipts,
  materialCost, receiptAmount, type FinanceDoc,
} from '../lib/finance.ts';

export { expenseTotal };

/** The subset of a document the analytics need (selected with JSON paths, so no signatures/logos are downloaded). */
export interface AnalyticsDoc extends FinanceDoc {
  createdAt: string;
  issueDate?: string | null;
  date?: string | null;
  dueDate?: string | null;
  clientName?: string | null;
}

export type Granularity = 'day' | 'week' | 'month';

export interface Bucket {
  key: string;
  label: string;
  startYMD: string;
  endYMD: string;
  /** collected (see AnalyticsResult.revenue) */
  revenue: number;
  invoiced: number;
  /** all costs dated in the bucket: material logs + expense logs + labor */
  expenses: number;
}

export interface ClientRow {
  name: string;
  invoiced: number;
  collected: number;
  invoices: number;
}

export interface AnalyticsResult {
  /**
   * Collected (lib/finance.ts): paid invoices (full total), the larger of "amount paid" and receipts on open
   * invoices, and receipts that are not for a billed invoice (on the receipt's date).
   */
  revenue: number;
  /** Total of invoices issued in range that are not Draft/Cancelled. */
  invoiced: number;
  invoiceCount: number;
  avgInvoice: number;
  /** Receipts dated in range that are not for a billed invoice (part of income). */
  otherReceipts: number;
  /** invoiced + otherReceipts */
  income: number;
  /** Balance still due on Sent/Overdue invoices issued in range. */
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  /** Internal cost (line-item unit costs) of paid invoices. For reference only: NOT part of profit (material logs are). */
  costOfGoods: number;
  /** Expense Log totals dated in range. */
  expenses: number;
  expenseCount: number;
  /** Material Log costs dated in range. */
  materials: number;
  /** Time-sheet labor dated in range (hours × labor rate, overtime 1.5×). */
  labor: number;
  hours: number;
  /** materials + expenses + labor */
  costs: number;
  /** income - costs (the lib/finance.ts definition, same as Job financials) */
  profit: number;
  /** profit / income (0..1), null when there is no income */
  profitMargin: number | null;
  estimatesSent: number;
  estimatesAccepted: number;
  estimatesRejected: number;
  estimatesPending: number;
  /** accepted / (sent + accepted + rejected), null when no estimate went out */
  winRate: number | null;
  /** Total of estimates still awaiting an answer */
  pipeline: number;
  invoiceStatusCounts: Record<string, number>;
  topClients: ClientRow[];
  buckets: Bucket[];
  granularity: Granularity;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** The business day a document belongs to. */
export const documentDay = (doc: AnalyticsDoc): string | null => {
  const t = norm(doc.type);
  const primary = t === 'invoice' || t === 'estimate' ? doc.issueDate ?? doc.date : doc.date ?? doc.issueDate;
  return normalizeYMD(primary) ?? instantToLocalYMD(doc.createdAt);
};

export const chooseGranularity = (startYMD: string, endYMD: string): Granularity => {
  const s = parseLocalDate(startYMD);
  const e = parseLocalDate(endYMD);
  if (!s || !e) return 'day';
  const days = daysBetween(s, e) + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Contiguous local-date buckets covering [startYMD, endYMD]. Weeks start on Monday. */
export const buildBuckets = (startYMD: string, endYMD: string, granularity: Granularity): Bucket[] => {
  const start = parseLocalDate(startYMD);
  const end = parseLocalDate(endYMD);
  if (!start || !end || start > end) return [];
  const out: Bucket[] = [];
  const empty = { revenue: 0, invoiced: 0, expenses: 0 };
  if (granularity === 'day') {
    for (let d = start; d <= end; d = addDaysLocal(d, 1)) {
      const ymd = toLocalYMD(d);
      out.push({ key: ymd, label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, startYMD: ymd, endYMD: ymd, ...empty });
    }
    return out;
  }
  if (granularity === 'week') {
    // first bucket starts at the range start, later buckets start on Mondays
    let cur = start;
    while (cur <= end) {
      const daysToSunday = (7 - cur.getDay()) % 7; // Sunday ends a Monday-based week
      let last = addDaysLocal(cur, daysToSunday);
      if (last > end) last = end;
      const ymd = toLocalYMD(cur);
      out.push({ key: ymd, label: `${MONTHS[cur.getMonth()]} ${cur.getDate()}`, startYMD: ymd, endYMD: toLocalYMD(last), ...empty });
      cur = addDaysLocal(last, 1);
    }
    return out;
  }
  let cur = start;
  while (cur <= end) {
    let last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    if (last > end) last = end;
    const ymd = toLocalYMD(cur);
    const label = cur.getFullYear() !== end.getFullYear() || cur.getFullYear() !== start.getFullYear()
      ? `${MONTHS[cur.getMonth()]} ’${String(cur.getFullYear()).slice(2)}`
      : MONTHS[cur.getMonth()];
    out.push({ key: ymd, label, startYMD: ymd, endYMD: toLocalYMD(last), ...empty });
    cur = addDaysLocal(last, 1);
  }
  return out;
};

const findBucket = (buckets: Bucket[], ymd: string): Bucket | undefined => {
  // buckets are sorted and contiguous: binary search
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid];
    if (ymd < b.startYMD) hi = mid - 1;
    else if (ymd > b.endYMD) lo = mid + 1;
    else return b;
  }
  return undefined;
};

/**
 * Aggregates documents for the inclusive local range [startYMD, endYMD].
 * `todayYMD` is injectable for tests (decides whether a Sent invoice is overdue).
 * `laborRate` prices time-sheet hours (lib/finance.ts resolveLaborRate; default $45/h).
 */
export const computeAnalytics = (
  docs: AnalyticsDoc[],
  startYMD: string,
  endYMD: string,
  options: { todayYMD?: string; granularity?: Granularity; laborRate?: number } = {},
): AnalyticsResult => {
  const today = options.todayYMD ?? toLocalYMD(new Date());
  const granularity = options.granularity ?? chooseGranularity(startYMD, endYMD);
  const laborRate = options.laborRate && options.laborRate > 0 ? options.laborRate : DEFAULT_LABOR_RATE;
  const buckets = buildBuckets(startYMD, endYMD, granularity);

  const r: AnalyticsResult = {
    revenue: 0, invoiced: 0, invoiceCount: 0, avgInvoice: 0, otherReceipts: 0, income: 0, outstanding: 0, outstandingCount: 0,
    overdue: 0, overdueCount: 0, costOfGoods: 0, expenses: 0, expenseCount: 0, materials: 0, labor: 0, hours: 0, costs: 0,
    profit: 0, profitMargin: null,
    estimatesSent: 0, estimatesAccepted: 0, estimatesRejected: 0, estimatesPending: 0, winRate: null, pipeline: 0,
    invoiceStatusCounts: {}, topClients: [], buckets, granularity,
  };
  if (!startYMD || !endYMD || startYMD > endYMD) return r;

  const clients = new Map<string, ClientRow>();
  // Receipts are linked to their invoice across the whole history (a November receipt can pay an October invoice).
  const links = linkReceipts(docs);
  const addCost = (bucket: Bucket | undefined, amount: number) => { if (bucket) bucket.expenses += amount; };

  for (const doc of docs) {
    const day = documentDay(doc);
    if (!day || day < startYMD || day > endYMD) continue;
    const type = norm(doc.type);
    const status = norm(doc.status) || 'draft';
    const bucket = findBucket(buckets, day);

    if (type === 'invoice') {
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      r.invoiceStatusCounts[statusLabel] = (r.invoiceStatusCounts[statusLabel] || 0) + 1;
      if (!isBilledInvoiceStatus(status)) continue;

      const totals = documentTotals(doc);
      const isPaid = isPaidStatus(status);
      const collected = invoiceCollected(doc, totals, links.byInvoice.get(doc.id) || 0);
      const due = roundMoney(Math.max(0, totals.total - collected));

      r.invoiced += totals.total;
      r.invoiceCount += 1;
      r.revenue += collected;
      if (isPaid) r.costOfGoods += computeDocumentCost({ lineItems: doc.lineItems });

      if (!isPaid && due > 0) {
        r.outstanding += due;
        r.outstandingCount += 1;
        const dueDate = normalizeYMD(doc.dueDate);
        if (status === 'overdue' || (dueDate && dueDate < today)) {
          r.overdue += due;
          r.overdueCount += 1;
        }
      }

      const name = String(doc.clientName || '').trim();
      if (name) {
        const row = clients.get(name.toLowerCase()) ?? { name, invoiced: 0, collected: 0, invoices: 0 };
        row.invoiced += totals.total;
        row.collected += collected;
        row.invoices += 1;
        clients.set(name.toLowerCase(), row);
      }

      if (bucket) {
        bucket.invoiced += totals.total;
        bucket.revenue += collected;
      }
    } else if (type === 'receipt') {
      // Receipts for a billed invoice are already in that invoice's "collected".
      if (!links.unlinked.has(doc.id)) continue;
      const amount = receiptAmount(doc);
      r.otherReceipts += amount;
      r.revenue += amount;
      if (bucket) bucket.revenue += amount;
    } else if (type === 'estimate') {
      if (status === 'draft') continue;
      const total = documentTotals(doc).total;
      if (status === 'accepted' || status === 'approved') r.estimatesAccepted += 1;
      else if (status === 'rejected' || status === 'declined') r.estimatesRejected += 1;
      else {
        r.estimatesPending += 1;
        r.pipeline += total;
      }
      r.estimatesSent += 1;
    } else if (type === 'expense log') {
      const amount = expenseTotal(doc);
      r.expenses += amount;
      r.expenseCount += 1;
      addCost(bucket, amount);
    } else if (type === 'material log') {
      const amount = materialCost(doc);
      r.materials += amount;
      addCost(bucket, amount);
    } else if (type === 'time sheet') {
      const l = laborOf(doc, laborRate);
      r.labor += l.cost;
      r.hours += l.hours + l.overtime;
      addCost(bucket, l.cost);
    }
  }

  r.revenue = roundMoney(r.revenue);
  r.invoiced = roundMoney(r.invoiced);
  r.otherReceipts = roundMoney(r.otherReceipts);
  r.income = roundMoney(r.invoiced + r.otherReceipts);
  r.outstanding = roundMoney(r.outstanding);
  r.overdue = roundMoney(r.overdue);
  r.costOfGoods = roundMoney(r.costOfGoods);
  r.expenses = roundMoney(r.expenses);
  r.materials = roundMoney(r.materials);
  r.labor = roundMoney(r.labor);
  r.hours = Math.round(r.hours * 100) / 100;
  r.costs = roundMoney(r.materials + r.expenses + r.labor);
  r.pipeline = roundMoney(r.pipeline);
  r.avgInvoice = r.invoiceCount > 0 ? roundMoney(r.invoiced / r.invoiceCount) : 0;
  r.profit = roundMoney(r.income - r.costs);
  r.profitMargin = r.income > 0 ? r.profit / r.income : null;
  r.winRate = r.estimatesSent > 0 ? r.estimatesAccepted / r.estimatesSent : null;
  for (const b of buckets) {
    b.revenue = roundMoney(b.revenue);
    b.invoiced = roundMoney(b.invoiced);
    b.expenses = roundMoney(b.expenses);
  }
  r.topClients = Array.from(clients.values())
    .map((c) => ({ ...c, invoiced: roundMoney(c.invoiced), collected: roundMoney(c.collected) }))
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 5);
  return r;
};

/** The range of equal length immediately before [startYMD, endYMD] (for "vs previous period"). */
export const previousRange = (startYMD: string, endYMD: string): { startYMD: string; endYMD: string } | null => {
  const s = parseLocalDate(startYMD);
  const e = parseLocalDate(endYMD);
  if (!s || !e || s > e) return null;
  const len = daysBetween(s, e) + 1;
  const prevEnd = addDaysLocal(s, -1);
  const prevStart = addDaysLocal(s, -len);
  return { startYMD: toLocalYMD(prevStart), endYMD: toLocalYMD(prevEnd) };
};

/** Relative change (0.25 = +25%), null when the previous value is 0. */
export const relativeChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : (current - previous) / Math.abs(previous);

export type RangePreset = 'this-month' | 'last-30' | 'last-90' | 'this-quarter' | 'this-year' | 'last-year';

export const presetRange = (preset: RangePreset, now = new Date()): { startYMD: string; endYMD: string } => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'this-month':
      return { startYMD: toLocalYMD(new Date(today.getFullYear(), today.getMonth(), 1)), endYMD: toLocalYMD(today) };
    case 'last-30':
      return { startYMD: toLocalYMD(addDaysLocal(today, -29)), endYMD: toLocalYMD(today) };
    case 'last-90':
      return { startYMD: toLocalYMD(addDaysLocal(today, -89)), endYMD: toLocalYMD(today) };
    case 'this-quarter': {
      const q = Math.floor(today.getMonth() / 3) * 3;
      return { startYMD: toLocalYMD(new Date(today.getFullYear(), q, 1)), endYMD: toLocalYMD(today) };
    }
    case 'this-year':
      return { startYMD: `${today.getFullYear()}-01-01`, endYMD: toLocalYMD(today) };
    case 'last-year':
      return { startYMD: `${today.getFullYear() - 1}-01-01`, endYMD: `${today.getFullYear() - 1}-12-31` };
    default:
      return { startYMD: toLocalYMD(addMonthsClamped(today, -1)), endYMD: toLocalYMD(today) };
  }
};
