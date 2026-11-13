/**
 * Turns the saved data of any of the 13 document types into ONE normalized, render-ready model.
 * Every string in a DocModel is already HTML-safe (escaped with esc() or sanitized with sanitizeRichText()),
 * so the layout code can concatenate freely. Money always comes from utils/money.ts (computeDocumentTotals),
 * so the PDF always shows the same numbers as the form.
 */
import { FormType } from '../../types.ts';
import type { Job, UserProfile } from '../../types.ts';
import { computeDocumentTotals, lineItemAmount, lineItemScheduledValue, roundMoney, toNumber } from '../money.ts';
import { esc, escMultiline, safeUrl, textOrRichToHtml } from '../escapeHtml.ts';
import {
  addDuration, fileSafe, formatDate, formatDateTime, formatNumber, formatPercent, isBlank, money, negMoney, str,
  type FormatOptions,
} from './format.ts';
import { renderVisualsHtml } from './widgets.ts';

export type DocKind =
  | 'invoice' | 'estimate' | 'workOrder' | 'dailyReport' | 'timeSheet' | 'materialLog' | 'expenseLog'
  | 'warranty' | 'note' | 'receipt' | 'changeOrder' | 'purchaseOrder' | 'profitReport';

export const DOC_KINDS: DocKind[] = [
  'invoice', 'estimate', 'workOrder', 'dailyReport', 'timeSheet', 'materialLog', 'expenseLog',
  'warranty', 'note', 'receipt', 'changeOrder', 'purchaseOrder', 'profitReport',
];

const KIND_BY_TYPE: Record<string, DocKind> = {
  [FormType.Invoice]: 'invoice', [FormType.Estimate]: 'estimate', [FormType.WorkOrder]: 'workOrder',
  [FormType.DailyJobReport]: 'dailyReport', [FormType.TimeSheet]: 'timeSheet', [FormType.MaterialLog]: 'materialLog',
  [FormType.ExpenseLog]: 'expenseLog', [FormType.Warranty]: 'warranty', [FormType.Note]: 'note',
  [FormType.Receipt]: 'receipt', [FormType.ChangeOrder]: 'changeOrder', [FormType.PurchaseOrder]: 'purchaseOrder',
  [FormType.ProfitReport]: 'profitReport',
};

export const KIND_TO_FORM_TYPE: Record<DocKind, FormType> = {
  invoice: FormType.Invoice, estimate: FormType.Estimate, workOrder: FormType.WorkOrder, dailyReport: FormType.DailyJobReport,
  timeSheet: FormType.TimeSheet, materialLog: FormType.MaterialLog, expenseLog: FormType.ExpenseLog, warranty: FormType.Warranty,
  note: FormType.Note, receipt: FormType.Receipt, changeOrder: FormType.ChangeOrder, purchaseOrder: FormType.PurchaseOrder,
  profitReport: FormType.ProfitReport,
};

/** Accepts a FormType value ("Work Order"), a kind ("workOrder") or an AI key ("WORK_ORDER", "daily report"). */
export const docKindFromType = (type: unknown): DocKind => {
  const raw = String(type ?? '').trim();
  if (KIND_BY_TYPE[raw]) return KIND_BY_TYPE[raw];
  if ((DOC_KINDS as string[]).includes(raw)) return raw as DocKind;
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  const aliases: Record<string, DocKind> = {
    invoice: 'invoice', estimate: 'estimate', quote: 'estimate', workorder: 'workOrder', dailyjobreport: 'dailyReport',
    dailyreport: 'dailyReport', timesheet: 'timeSheet', materiallog: 'materialLog', expenselog: 'expenseLog',
    expense: 'expenseLog', warranty: 'warranty', note: 'note', receipt: 'receipt', changeorder: 'changeOrder',
    purchaseorder: 'purchaseOrder', profitreport: 'profitReport',
  };
  return aliases[k] || 'invoice';
};

export const DOC_TITLES: Record<DocKind, string> = {
  invoice: 'Invoice', estimate: 'Estimate', workOrder: 'Work Order', dailyReport: 'Daily Report', timeSheet: 'Time Sheet',
  materialLog: 'Material Log', expenseLog: 'Expense Report', warranty: 'Warranty', note: 'Note', receipt: 'Receipt',
  changeOrder: 'Change Order', purchaseOrder: 'Purchase Order', profitReport: 'Profit Report',
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export interface Party { label: string; name: string; lines: string[] }
export interface MetaItem { label: string; value: string }
export interface Column { label: string; align: 'left' | 'right' | 'center'; width?: string; cls?: string }
export interface ItemsTable { columns: Column[]; rows: string[][]; emptyText: string; minRows?: number }
export interface TotalLine { label: string; value: string; kind?: 'normal' | 'muted' | 'grand' | 'balance' }
export interface Fact { label: string; value: string; sub?: string }
export interface Section { id: string; title: string; html: string; rich?: boolean }
export interface Signature { label: string; imageUrl: string; name: string; date: string }
export interface StatusBadge { text: string; tone: 'good' | 'bad' | 'warn' | 'neutral' }

export interface DocModel {
  kind: DocKind;
  title: string;
  subject: string;
  numberLabel: string;
  number: string;
  status: StatusBadge | null;
  company: {
    name: string;
    logoUrl: string;
    initials: string;
    addressLines: string[];
    phone: string;
    email: string;
    website: string;
    /** address + phone + email + website, one entry per line */
    lines: string[];
    tagline: string;
    /** address lines + one "phone · email · website" line */
    compactLines: string[];
  };
  parties: Party[];
  meta: MetaItem[];
  keyDate: MetaItem | null;
  highlight: MetaItem | null;
  facts: Fact[];
  tags: string[];
  intro: string;
  before: Section[];
  items: ItemsTable | null;
  totals: TotalLine[];
  summaryNotes: Section[];
  paymentLink: { url: string; label: string } | null;
  visualsHtml: string;
  after: Section[];
  signatures: Signature[];
  closing: string;
  footerLine: string;
  runningTitle: string;
  fileBaseName: string;
  internal: boolean;
}

export interface ModelOptions extends FormatOptions {
  /** Document creation timestamp (FormData.createdAt), used when the data has no date (notes). */
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const t = (v: unknown) => esc(str(v).trim());
const has = (v: unknown) => !isBlank(v) && str(v).trim() !== '';
const splitLines = (v: unknown): string[] => str(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(esc);
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const meta = (label: string, value: unknown, fmt?: (v: unknown) => string): MetaItem | null => {
  if (!has(value)) return null;
  const out = fmt ? fmt(value) : str(value).trim();
  return out ? { label, value: esc(out) } : null;
};
const compact = <T>(list: Array<T | null | undefined | false | ''>): T[] => list.filter(Boolean) as T[];
/**
 * Joins short items ("phone · email · website") into lines of at most ~`max` characters, so a narrow header
 * column never wraps in the middle of the list and leaves a dangling "·" at the end of a line.
 */
const joinShort = (items: string[], max: number): string[] => {
  const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').length;
  const out: string[][] = [];
  for (const it of items) {
    // first fit: "phone · website" can share a line while a long e-mail address gets its own
    const line = out.find((l) => l.reduce((a, x) => a + plain(x) + 3, 0) + plain(it) <= max);
    if (line) line.push(it); else out.push([it]);
  }
  return out.map((l) => l.join('<span class="cd-dot">·</span>'));
};
const section = (id: string, title: string, value: unknown): Section | null => {
  if (!has(value)) return null;
  const html = textOrRichToHtml(value);
  if (!html.replace(/<[^>]+>/g, '').trim() && !/<img/i.test(html)) return null;
  return { id, title, html, rich: /<\/?(p|ul|ol|h\d|table|div|img)\b/i.test(html) };
};
const sig = (label: string, url: unknown, name?: unknown, date?: unknown, fmt: FormatOptions = {}): Signature => ({
  label,
  imageUrl: safeUrl(url),
  name: t(name),
  date: has(date) ? esc(formatDateTime(date, fmt)) : '',
});

const STATUS_TONES: Array<[RegExp, StatusBadge['tone']]> = [
  [/paid|accepted|approved|completed|received|signed/i, 'good'],
  [/overdue|rejected|declined|cancel+ed|void|failed/i, 'bad'],
  [/progress|hold|partial|pending|scheduled|deposit/i, 'warn'],
];
const badge = (text: unknown, hide: RegExp = /^(draft|sent|)$/i): StatusBadge | null => {
  const s = str(text).trim();
  if (!s || hide.test(s)) return null;
  const label = /^cancel+ed$/i.test(s) ? 'Void' : /^rejected$/i.test(s) ? 'Declined' : s;
  const tone = STATUS_TONES.find(([re]) => re.test(s))?.[1] || 'neutral';
  return { text: esc(label), tone };
};

interface LineLike {
  description?: unknown; quantity?: unknown; rate?: unknown; percentComplete?: unknown; previouslyBilled?: unknown;
  isAssembly?: boolean; hideComponentsOnPdf?: boolean; assemblyComponents?: Array<{ name?: unknown; quantity?: unknown }>;
  [k: string]: unknown;
}

const isMeaningfulLine = (li: LineLike | null | undefined, progress = false) =>
  !!li && (has(li.description) || lineItemAmount(li as any, progress) !== 0 || lineItemScheduledValue(li as any) !== 0);

const describeLine = (li: LineLike): string => {
  const name = has(li.description) ? escMultiline(str(li.description).trim()) : '<span class="cd-muted">Item</span>';
  let sub = '';
  const comps = Array.isArray(li.assemblyComponents) ? li.assemblyComponents : [];
  if (li.isAssembly && !li.hideComponentsOnPdf && comps.length) {
    sub = `<ul class="cd-item-sub">${comps
      .filter((c) => c && has(c.name))
      .map((c) => `<li>${t(c.name)} <span class="cd-muted">× ${formatNumber(toNumber(c.quantity) * (toNumber(li.quantity) || 1))}</span></li>`)
      .join('')}</ul>`;
  }
  return `<div class="cd-item-name">${name}</div>${sub}`;
};

const lineItemsTable = (raw: unknown, fmt: FormatOptions, opts: { progress?: boolean; descLabel?: string; rateLabel?: string } = {}): ItemsTable => {
  const progress = !!opts.progress;
  const items = (Array.isArray(raw) ? raw : []).filter((li) => isMeaningfulLine(li, progress)) as LineLike[];
  if (progress) {
    return {
      columns: [
        { label: opts.descLabel || 'Description', align: 'left', cls: 'cd-c-desc' },
        { label: 'Scheduled value', align: 'right', width: '17%' },
        { label: '% Complete', align: 'right', width: '12%' },
        { label: 'Prev. billed', align: 'right', width: '15%' },
        { label: 'This period', align: 'right', width: '16%' },
      ],
      rows: items.map((li) => [
        describeLine(li),
        money(lineItemScheduledValue(li as any), fmt),
        formatPercent(Math.min(100, Math.max(0, toNumber(li.percentComplete))), 1),
        money(li.previouslyBilled, fmt),
        money(lineItemAmount(li as any, true), fmt),
      ]),
      emptyText: 'No line items.',
    };
  }
  return {
    columns: [
      { label: opts.descLabel || 'Description', align: 'left', cls: 'cd-c-desc' },
      { label: 'Qty', align: 'right', width: '10%' },
      { label: opts.rateLabel || 'Rate', align: 'right', width: '16%' },
      { label: 'Amount', align: 'right', width: '18%' },
    ],
    rows: items.map((li) => [describeLine(li), formatNumber(li.quantity, 3), money(li.rate, fmt), money(lineItemAmount(li as any, false), fmt)]),
    emptyText: 'No line items.',
  };
};

const standardTotals = (data: any, fmt: FormatOptions, grandLabel: string, opts: { paidInFull?: boolean } = {}) => {
  const tot = computeDocumentTotals(data);
  const lines: TotalLine[] = [{ label: 'Subtotal', value: money(tot.subtotal, fmt) }];
  if (tot.discount > 0) lines.push({ label: 'Discount', value: negMoney(tot.discount, fmt) });
  if (tot.taxRate > 0 || tot.tax > 0) lines.push({ label: `Tax (${formatNumber(tot.taxRate, 3)}%)`, value: money(tot.tax, fmt) });
  if (tot.shipping > 0) lines.push({ label: 'Shipping', value: money(tot.shipping, fmt) });
  lines.push({ label: grandLabel, value: money(tot.total, fmt), kind: 'grand' });
  const paid = opts.paidInFull && isBlank(data?.amountPaid) ? tot.total : tot.amountPaid;
  const balance = roundMoney(Math.max(0, tot.total - paid));
  if (paid > 0) {
    lines.push({ label: 'Amount paid', value: negMoney(paid, fmt), kind: 'muted' });
    lines.push({ label: 'Balance due', value: money(balance, fmt), kind: 'balance' });
  }
  return { tot, lines, paid, balance };
};

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------
export const buildDocumentModel = (
  type: unknown,
  rawData: unknown,
  profile?: Partial<UserProfile> | null,
  job?: Partial<Job> | null,
  options: ModelOptions = {},
): DocModel => {
  const kind = docKindFromType(type);
  const d: any = rawData && typeof rawData === 'object' ? rawData : {};
  const p: any = profile || {};
  const j: any = job || {};
  const fmt: FormatOptions = { locale: options.locale || 'en-US', currency: str(d.currency || p.currency) || options.currency || 'USD' };
  const fd = (v: unknown) => formatDate(v, fmt);

  // --- company ---------------------------------------------------------------
  const companyName = str(d.companyName).trim() || str(p.companyName).trim() || str(p.name).trim();
  const addressLines = splitLines(d.companyAddress || p.address);
  const phone = t(d.companyPhone || p.phone);
  const email = t(d.companyEmail || p.email);
  const website = t(d.companyWebsite || p.website);
  const company = {
    name: esc(companyName),
    logoUrl: safeUrl(d.logoUrl || p.logoUrl),
    initials: esc(companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()),
    addressLines,
    phone,
    email,
    website,
    lines: [...addressLines, phone, email, website].filter(Boolean),
    compactLines: [...addressLines, ...joinShort([phone, email, website].filter(Boolean), 40)],
    tagline: t(d.companyTagline || p.jobTitle),
  };

  // --- client -----------------------------------------------------------------
  // receipts saved by older versions kept the payer in `from`
  const clientName = str(d.clientName).trim() || (kind === 'receipt' ? str(d.from).trim() : '') || str(j.clientName).trim();
  // The job's client address is only a fallback for the job's own client: a different client typed on the form
  // must never get the job client's address, and forms without a client-address field (daily report, warranty,
  // expense) never show one.
  const sameAsJobClient = clientName.toLowerCase() === str(j.clientName).trim().toLowerCase();
  const clientAddress = d.clientAddress ?? (kind === 'dailyReport' || kind === 'warranty' || kind === 'expenseLog' || !sameAsJobClient ? '' : j.clientAddress);
  const clientParty = (label: string, extraLines: string[] = []): Party | null => {
    const lines = [...splitLines(clientAddress), ...compact([t(d.clientEmail), t(d.clientPhone)]), ...extraLines].filter(Boolean);
    if (!clientName && !lines.length) return null;
    return { label, name: esc(clientName), lines };
  };
  const projectName = str(d.projectName).trim() || str(j.name).trim();

  const model: DocModel = {
    kind,
    title: DOC_TITLES[kind],
    subject: '',
    numberLabel: 'No.',
    number: '',
    status: null,
    company,
    parties: [],
    meta: [],
    keyDate: null,
    highlight: null,
    facts: [],
    tags: [],
    intro: '',
    before: [],
    items: null,
    totals: [],
    summaryNotes: [],
    paymentLink: null,
    visualsHtml: renderVisualsHtml(d.ai_visual_data),
    after: [],
    signatures: [],
    closing: '',
    footerLine: '',
    runningTitle: '',
    fileBaseName: '',
    internal: false,
  };

  // A custom document title ("Kitchen remodel – phase 2") becomes the subject line unless it just repeats the type.
  const customTitle = str(d.title).trim();
  const titleIsGeneric = !customTitle || new RegExp(`^(${DOC_TITLES[kind]}|${kind}|new\\s+\\w+)\\b`, 'i').test(customTitle);

  const contractorSig = () => (has(d.signatureUrl) || has(d.signature)
    ? sig('Authorized signature', d.signatureUrl || d.signature, d.signerName || p.name || companyName, d.signedAt || d.date || d.issueDate, fmt)
    : null);
  const clientSig = (label: string, blankIfMissing: boolean) => {
    if (has(d.clientSignatureUrl)) {
      return sig(label, d.clientSignatureUrl, d.clientSignerName || d.clientSignedBy || clientName, d.clientSignedAt, fmt);
    }
    return blankIfMissing ? sig(label, '', '', '') : null;
  };

  switch (kind) {
    case 'invoice': {
      const progress = !!d.isProgressBilling;
      const status = str(d.status);
      const { tot, lines, balance } = standardTotals(d, fmt, 'Total', { paidInFull: /^paid$/i.test(status) });
      model.number = t(d.invoiceNumber);
      model.numberLabel = 'Invoice No.';
      model.status = badge(status);
      model.parties = compact([clientParty('Bill to')]);
      model.meta = compact([
        meta('Invoice date', d.issueDate || d.date, fd),
        meta('Due date', d.dueDate, fd),
        meta('Project', projectName),
        meta('Payment terms', d.paymentTerms),
        meta('PO number', d.poNumber),
        d.recurrence?.enabled ? meta('Billing', `Recurring · ${str(d.recurrence.frequency) || 'Monthly'}`) : null,
      ]);
      model.keyDate = meta('Due by', d.dueDate, fd);
      model.items = lineItemsTable(d.lineItems, fmt, { progress });
      model.totals = lines;
      model.highlight = { label: 'Amount due', value: esc(money(balance, fmt)) };
      if (progress) {
        const items = (Array.isArray(d.lineItems) ? d.lineItems : []) as LineLike[];
        const scheduled = roundMoney(items.reduce((a, li) => a + lineItemScheduledValue(li as any), 0));
        const earned = roundMoney(items.reduce((a, li) => a + lineItemScheduledValue(li as any) * Math.min(100, Math.max(0, toNumber(li.percentComplete))) / 100, 0));
        const prev = roundMoney(items.reduce((a, li) => a + toNumber(li.previouslyBilled), 0));
        model.summaryNotes.push({
          id: 'progress',
          title: 'Progress billing summary',
          html: `<table class="cd-mini"><tbody>
            <tr><td>Total contract value</td><td>${money(scheduled, fmt)}</td></tr>
            <tr><td>Completed to date</td><td>${money(earned, fmt)}${scheduled ? ` <span class="cd-muted">(${formatPercent((earned / scheduled) * 100, 1)})</span>` : ''}</td></tr>
            <tr><td>Previously billed</td><td>${money(prev, fmt)}</td></tr>
            <tr><td>This invoice</td><td>${money(tot.subtotal, fmt)}</td></tr>
          </tbody></table>`,
        });
      }
      const link = safeUrl(d.paypalLink || d.paymentLink);
      if (link && /^https?:/i.test(link)) model.paymentLink = { url: link, label: 'Pay online' };
      model.after = compact([section('notes', 'Notes', d.notes), section('terms', 'Terms & conditions', d.terms)]);
      model.signatures = compact([contractorSig(), clientSig('Client signature', false)]);
      // Only add the closing line when the notes don't already thank the client (avoids printing it twice).
      model.closing = /thank you/i.test(String(d.notes || '')) ? '' : 'Thank you for your business!';
      break;
    }
    case 'estimate': {
      const { lines, tot } = standardTotals(d, fmt, 'Estimate total');
      model.number = t(d.estimateNumber);
      model.numberLabel = 'Estimate No.';
      model.status = badge(d.status);
      model.parties = compact([clientParty('Prepared for')]);
      model.meta = compact([
        meta('Estimate date', d.issueDate || d.date, fd),
        meta('Valid until', d.expiryDate, fd),
        meta('Project', projectName),
        meta('Site address', d.projectAddress),
      ]);
      model.keyDate = meta('Valid until', d.expiryDate, fd);
      model.before = compact([section('scope', 'Project scope', d.description_html || d.scope || d.description)]);
      model.items = lineItemsTable(d.lineItems, fmt);
      model.totals = lines;
      model.highlight = { label: 'Estimate total', value: esc(money(tot.total, fmt)) };
      model.after = compact([section('notes', 'Notes', d.notes), section('terms', 'Terms & conditions', d.terms)]);
      model.signatures = compact([contractorSig() || sig('Contractor', '', companyName, ''), clientSig('Client acceptance', true)]);
      model.closing = 'We appreciate the opportunity to earn your business.';
      break;
    }
    case 'changeOrder': {
      const tot = computeDocumentTotals({ lineItems: d.lineItems });
      const original = roundMoney(toNumber(d.currentContractSum));
      const change = tot.total;
      const newSum = roundMoney(original + change);
      const signed = (v: number) => (v < 0 ? negMoney(v, fmt) : `+${money(v, fmt)}`);
      model.number = t(d.changeOrderNumber);
      model.numberLabel = 'Change Order No.';
      model.status = badge(d.status);
      model.parties = compact([clientParty('Owner / client')]);
      model.meta = compact([meta('Date', d.date, fd), meta('Project', projectName), meta('Reason', d.reason)]);
      model.keyDate = meta('Date', d.date, fd);
      model.before = compact([section('description', 'Description of change', d.description || d.description_html)]);
      model.items = lineItemsTable(d.lineItems, fmt);
      model.totals = [
        { label: 'Current contract value', value: money(original, fmt) },
        { label: 'This change', value: signed(change) },
        { label: 'New contract total', value: money(newSum, fmt), kind: 'grand' },
      ];
      model.highlight = { label: 'Net change', value: esc(signed(change)) };
      model.after = compact([section('terms', 'Terms', d.terms)]);
      model.signatures = compact([contractorSig() || sig('Contractor', '', companyName, ''), clientSig('Owner / client approval', true)]);
      break;
    }
    case 'purchaseOrder': {
      const { lines, tot } = standardTotals(d, fmt, 'Order total');
      model.number = t(d.poNumber);
      model.numberLabel = 'PO No.';
      model.status = badge(d.status, /^(draft|)$/i);
      const vendorLines = [...splitLines(d.vendorAddress), t(d.vendorPhone), t(d.vendorEmail)].filter(Boolean);
      const shipLines = [...splitLines(d.shipToAddress), t(d.shipToPhone)].filter(Boolean);
      model.parties = compact([
        has(d.vendorName) || vendorLines.length ? { label: 'Vendor', name: t(d.vendorName), lines: vendorLines } : null,
        has(d.shipToName) || shipLines.length
          ? { label: has(d.shipToType) ? `Ship to · ${t(d.shipToType)}` : 'Ship to', name: t(d.shipToName), lines: shipLines }
          : null,
      ]);
      model.meta = compact([
        meta('Order date', d.date, fd),
        meta('Required by', d.deliveryDate, fd),
        meta('Project', projectName),
      ]);
      model.keyDate = meta('Required by', d.deliveryDate, fd);
      model.items = lineItemsTable(d.lineItems, fmt, { descLabel: 'Item', rateLabel: 'Unit price' });
      model.totals = lines;
      model.highlight = { label: 'Order total', value: esc(money(tot.total, fmt)) };
      model.after = compact([section('delivery', 'Delivery instructions', d.deliveryInstructions), section('notes', 'Notes to vendor', d.notes)]);
      model.signatures = [contractorSig() || sig('Authorized signature', '', companyName, '')];
      break;
    }
    case 'workOrder': {
      model.number = t(d.workOrderNumber);
      model.numberLabel = 'Work Order No.';
      model.status = badge(d.status, /^$/);
      model.parties = compact([clientParty('Customer / service location')]);
      model.meta = compact([meta('Date', d.date, fd), meta('Project', projectName)]);
      model.keyDate = meta('Date', d.date, fd);
      model.facts = compact([
        has(d.hours) ? { label: 'Labor hours', value: esc(`${formatNumber(d.hours, 2)} h`) } : null,
        has(d.cost) ? { label: 'Estimated cost', value: esc(money(d.cost, fmt)) } : null,
      ]);
      model.highlight = has(d.cost) ? { label: 'Estimated cost', value: esc(money(d.cost, fmt)) } : null;
      model.before = compact([
        section('scope', 'Scope of work', d.description || d.description_html),
        section('materials', 'Materials used', d.materialsUsed),
      ]);
      model.after = compact([section('terms', 'Terms', d.terms)]);
      model.signatures = compact([contractorSig() || sig('Technician', '', '', ''), clientSig('Customer approval', true)]);
      break;
    }
    case 'dailyReport': {
      model.number = t(d.reportNumber);
      model.numberLabel = 'Report No.';
      model.parties = compact([
        projectName || has(d.projectAddress) ? { label: 'Project', name: esc(projectName), lines: splitLines(d.projectAddress) } : null,
        clientName ? { label: 'Client', name: esc(clientName), lines: [] } : null,
      ]);
      // date / weather / temperature are shown as fact cards; keep them out of the details list (no duplicates)
      model.meta = [];
      model.keyDate = meta('Report date', d.date, fd);
      model.facts = compact([
        has(d.date) ? { label: 'Date', value: esc(fd(d.date)) } : null,
        has(d.weather) ? { label: 'Weather', value: t(d.weather) } : null,
        has(d.temperature) ? { label: 'Temperature', value: t(d.temperature) } : null,
        has(d.crewSize) ? { label: 'Crew on site', value: esc(formatNumber(d.crewSize, 0)) } : null,
        has(d.laborHours) ? { label: 'Labor hours', value: esc(`${formatNumber(d.laborHours, 2)} h`) } : null,
      ]);
      model.tags = (Array.isArray(d.tags) ? d.tags : []).map(str).filter((s: string) => s.trim()).map(esc);
      const content = section('report', '', d.content);
      model.before = compact([content || { id: 'report', title: '', html: '<p class="cd-muted">No report details were entered.</p>' }]);
      model.signatures = compact([has(d.signatureUrl) ? sig('Site supervisor', d.signatureUrl, d.signerName || p.name, d.date, fmt) : null]);
      break;
    }
    case 'timeSheet': {
      const reg = toNumber(d.hoursWorked);
      const ot = toNumber(d.overtimeHours);
      const total = roundMoney(reg + ot);
      model.number = t(d.timesheetNumber || d.timeSheetNumber);
      model.numberLabel = 'Time Sheet No.';
      model.status = badge(d.status);
      model.parties = compact([
        has(d.workerName) ? { label: 'Worker', name: t(d.workerName), lines: compact([t(d.workerRole)]) } : null,
        clientParty('Job / client'),
      ]);
      model.meta = compact([meta('Date', d.date, fd), meta('Project', projectName)]);
      model.keyDate = meta('Date', d.date, fd);
      model.facts = [
        { label: 'Regular hours', value: esc(formatNumber(reg, 2)) },
        { label: 'Overtime hours', value: esc(formatNumber(ot, 2)) },
        { label: 'Total hours', value: esc(formatNumber(total, 2)) },
      ];
      model.items = {
        columns: [
          { label: 'Date', align: 'left', width: '22%' },
          { label: 'Worker', align: 'left', cls: 'cd-c-desc' },
          { label: 'Regular', align: 'right', width: '14%' },
          { label: 'Overtime', align: 'right', width: '14%' },
          { label: 'Total', align: 'right', width: '14%' },
        ],
        rows: [[esc(fd(d.date)), t(d.workerName) || '<span class="cd-muted">—</span>', formatNumber(reg, 2), formatNumber(ot, 2), formatNumber(total, 2)]],
        emptyText: '',
      };
      model.totals = [{ label: 'Total hours', value: esc(`${formatNumber(total, 2)} h`), kind: 'grand' }];
      model.highlight = { label: 'Total hours', value: esc(`${formatNumber(total, 2)} h`) };
      model.after = compact([section('notes', 'Notes', d.notes)]);
      // the form's single signature is "worker or supervisor", so it is not attributed to the worker by name
      model.signatures = has(d.signatureUrl)
        ? [sig('Signature', d.signatureUrl, d.signerName, d.date, fmt)]
        : [sig('Worker signature', '', '', ''), sig('Supervisor approval', '', '', '')];
      break;
    }
    case 'materialLog': {
      const source: any[] = Array.isArray(d.items) && d.items.length ? d.items : Array.isArray(d.lineItems) ? d.lineItems : [];
      const rows = source
        .map((it) => ({ name: it?.name ?? it?.description, supplier: it?.supplier, qty: toNumber(it?.quantity), cost: toNumber(it?.unitCost ?? it?.rate) }))
        .filter((r) => has(r.name) || r.qty * r.cost !== 0);
      const total = roundMoney(rows.reduce((a, r) => a + roundMoney(r.qty * r.cost), 0));
      model.number = t(d.logNumber || d.materialLogNumber);
      model.numberLabel = 'Log No.';
      model.parties = compact([
        projectName || has(d.projectAddress) ? { label: 'Project', name: esc(projectName), lines: splitLines(d.projectAddress) } : null,
        clientParty('Client'),
      ]);
      model.meta = compact([meta('Date', d.date, fd)]);
      model.keyDate = meta('Date', d.date, fd);
      model.items = {
        columns: [
          { label: 'Material', align: 'left', cls: 'cd-c-desc' },
          { label: 'Supplier', align: 'left', width: '20%' },
          { label: 'Qty', align: 'right', width: '9%' },
          { label: 'Unit cost', align: 'right', width: '15%' },
          { label: 'Total', align: 'right', width: '16%' },
        ],
        rows: rows.map((r) => [
          `<div class="cd-item-name">${has(r.name) ? escMultiline(str(r.name).trim()) : '<span class="cd-muted">Material</span>'}</div>`,
          t(r.supplier),
          formatNumber(r.qty, 3),
          money(r.cost, fmt),
          money(roundMoney(r.qty * r.cost), fmt),
        ]),
        emptyText: 'No materials recorded.',
      };
      model.totals = [{ label: 'Total material cost', value: money(total, fmt), kind: 'grand' }];
      model.highlight = { label: 'Total cost', value: esc(money(total, fmt)) };
      model.after = compact([section('notes', 'Notes', d.notes)]);
      model.signatures = compact([has(d.signatureUrl) ? sig('Received / verified by', d.signatureUrl, d.signerName, d.date, fmt) : null]);
      break;
    }
    case 'expenseLog': {
      let rows: Array<{ desc: unknown; qty: number; rate: number; amount: number }> = [];
      const lineItems = (Array.isArray(d.lineItems) ? d.lineItems : []).filter((li: LineLike) => isMeaningfulLine(li));
      if (lineItems.length) {
        rows = lineItems.map((li: any) => ({ desc: li.description, qty: has(li.quantity) ? toNumber(li.quantity) : 1, rate: toNumber(li.rate), amount: 0 }))
          .map((r: any) => ({ ...r, amount: roundMoney(r.qty * r.rate) }));
      } else if (Array.isArray(d.items) && d.items.length) {
        rows = d.items.filter((i: any) => i && (has(i.description) || toNumber(i.amount))).map((i: any) => ({ desc: i.description, qty: 1, rate: toNumber(i.amount), amount: roundMoney(toNumber(i.amount)) }));
      }
      const tax = roundMoney(Math.max(0, toNumber(d.tax)));
      if (!rows.length && toNumber(d.amount) > 0) {
        const amt = roundMoney(Math.max(0, toNumber(d.amount) - tax));
        rows = [{ desc: d.item || d.category || 'Expense', qty: 1, rate: amt, amount: amt }];
      }
      const subtotal = roundMoney(rows.reduce((a, r) => a + r.amount, 0));
      const computed = roundMoney(subtotal + tax);
      // "Total paid" (amount) is what the user entered (or what the form computed from items + tax); when it
      // differs from items + tax the difference is shown as an adjustment so the lines still add up.
      const paidTotal = toNumber(d.amount) > 0 ? roundMoney(toNumber(d.amount)) : 0;
      const total = paidTotal || computed;
      const adjustment = paidTotal ? roundMoney(paidTotal - computed) : 0;
      model.number = t(d.expenseNumber || d.reportNumber);
      model.numberLabel = 'Report No.';
      model.parties = compact([
        has(d.vendor) ? { label: 'Vendor / store', name: t(d.vendor), lines: [] } : null,
        clientParty('Job / client'),
      ]);
      // (an old single-item expense's `item` is the description of its row, so it is not repeated in the details)
      model.meta = compact([meta('Date', d.date, fd), meta('Category', d.category), meta('Project', projectName)]);
      model.keyDate = meta('Date', d.date, fd);
      model.items = {
        columns: [
          { label: 'Description', align: 'left', cls: 'cd-c-desc' },
          { label: 'Qty', align: 'right', width: '10%' },
          { label: 'Unit cost', align: 'right', width: '16%' },
          { label: 'Amount', align: 'right', width: '18%' },
        ],
        rows: rows.map((r) => [`<div class="cd-item-name">${has(r.desc) ? escMultiline(str(r.desc).trim()) : '<span class="cd-muted">Expense</span>'}</div>`, formatNumber(r.qty, 3), money(r.rate, fmt), money(r.amount, fmt)]),
        emptyText: 'No expenses recorded.',
      };
      model.totals = compact<TotalLine>([
        { label: 'Subtotal', value: money(subtotal, fmt) },
        tax > 0 ? { label: 'Tax paid', value: money(tax, fmt) } : null,
        adjustment ? { label: 'Adjustment', value: adjustment < 0 ? negMoney(-adjustment, fmt) : money(adjustment, fmt) } : null,
        { label: 'Total paid', value: money(total, fmt), kind: 'grand' },
      ]);
      model.highlight = { label: 'Total paid', value: esc(money(total, fmt)) };
      model.after = compact([section('notes', 'Notes', d.notes)]);
      model.signatures = compact([has(d.signatureUrl) ? sig('Approved by', d.signatureUrl, d.signerName, d.date, fmt) : null]);
      break;
    }
    case 'warranty': {
      const until = addDuration(d.completedDate, d.duration);
      model.title = 'Warranty';
      model.number = t(d.warrantyNumber);
      model.numberLabel = 'Certificate No.';
      model.parties = compact([
        clientName || has(d.projectAddress) ? { label: 'Issued to', name: esc(clientName), lines: splitLines(d.projectAddress) } : null,
      ]);
      model.meta = compact([meta('Project', projectName)]);
      model.keyDate = until ? { label: 'Valid through', value: esc(fd(until)) } : meta('Completed', d.completedDate, fd);
      model.facts = compact([
        has(d.duration) ? { label: 'Warranty period', value: t(d.duration) } : null,
        has(d.completedDate) ? { label: 'Effective from', value: esc(fd(d.completedDate)) } : null,
        until ? { label: 'Valid through', value: esc(fd(until)) } : null,
      ]);
      const who = companyName ? `<strong>${esc(companyName)}</strong>` : 'the contractor';
      const where = has(d.projectAddress) ? ` at <strong>${t(str(d.projectAddress).replace(/\s*\n\s*/g, ', '))}</strong>` : '';
      const forWhom = clientName ? ` for <strong>${esc(clientName)}</strong>` : '';
      const when = has(d.completedDate) ? `, completed on <strong>${esc(fd(d.completedDate))}</strong>,` : '';
      const period = has(d.duration) ? ` for a period of <strong>${t(d.duration)}</strong>` : '';
      model.intro = `This certifies that the work performed by ${who}${where}${forWhom}${when} is warranted against defects in materials and workmanship${period}, subject to the coverage and conditions described below.`;
      model.highlight = has(d.duration) ? { label: 'Warranty period', value: t(d.duration) } : null;
      model.after = compact([section('coverage', 'Coverage', d.coverage), section('conditions', 'Conditions & exclusions', d.conditions)]);
      model.signatures = compact([
        contractorSig() || sig('Authorized signature', '', companyName, ''),
        clientSig('Property owner', false),
      ]);
      break;
    }
    case 'note': {
      model.subject = esc(str(d.title).trim());
      const noteDate = [d.date, d.createdAt, options.createdAt].find((v) => has(v)) ?? localToday();
      model.meta = compact([meta('Date', noteDate, fd), meta('Project', projectName), meta('Client', clientName)]);
      model.tags = (Array.isArray(d.tags) ? d.tags : []).map(str).filter((s: string) => s.trim()).map(esc);
      model.before = compact([section('content', '', d.content) || { id: 'content', title: '', html: '<p class="cd-muted">This note is empty.</p>' }]);
      model.signatures = compact([has(d.signatureUrl) ? sig('Signed', d.signatureUrl, p.name, d.date, fmt) : null]);
      break;
    }
    case 'receipt': {
      const amount = roundMoney(toNumber(d.amount));
      const status = str(d.paymentStatus || d.status).trim();
      model.number = t(d.receiptNumber);
      model.numberLabel = 'Receipt No.';
      model.status = { text: esc(status || 'Payment received'), tone: /partial|deposit/i.test(status) ? 'warn' : 'good' };
      model.parties = compact([clientParty('Received from')]);
      model.meta = compact([meta('Date received', d.date, fd), meta('Payment method', d.paymentMethod), meta('Project', projectName), meta('For invoice', d.invoiceNumber)]);
      model.keyDate = meta('Date', d.date, fd);
      model.highlight = { label: 'Amount received', value: esc(money(amount, fmt)) };
      model.intro = `Received from <strong>${clientName ? esc(clientName) : 'the client'}</strong> the sum of <strong>${esc(money(amount, fmt))}</strong>${has(d.paymentMethod) ? ` by ${t(d.paymentMethod)}` : ''}${has(d.date) ? ` on ${esc(fd(d.date))}` : ''}.`;
      model.items = {
        columns: [{ label: 'Description', align: 'left', cls: 'cd-c-desc' }, { label: 'Amount', align: 'right', width: '22%' }],
        rows: [[`<div class="cd-item-name">${has(d.description) ? escMultiline(str(d.description).trim()) : 'Payment received'}</div>`, money(amount, fmt)]],
        emptyText: '',
      };
      model.totals = [{ label: 'Total received', value: money(amount, fmt), kind: 'grand' }];
      model.signatures = [has(d.signatureUrl) ? sig('Received by', d.signatureUrl, d.signerName || p.name || companyName, d.date, fmt) : sig('Received by', '', companyName, '')];
      model.closing = 'Thank you for your payment!';
      break;
    }
    case 'profitReport': {
      const items: any[] = Array.isArray(d.items) ? d.items : [];
      const rows = items.filter((i) => i && (has(i.description) || toNumber(i.cost) || toNumber(i.charge)));
      const totalCost = rows.length ? roundMoney(rows.reduce((a, i) => a + toNumber(i.cost), 0)) : roundMoney(toNumber(d.totalCost));
      const revenue = rows.length ? roundMoney(rows.reduce((a, i) => a + toNumber(i.charge), 0)) : roundMoney(toNumber(d.totalRevenue));
      const profit = roundMoney(revenue - totalCost);
      const margin = revenue ? (profit / revenue) * 100 : 0;
      const markup = totalCost ? (profit / totalCost) * 100 : 0;
      const vatRate = d.vatEnabled ? toNumber(d.vatRate) : 0;
      const vat = roundMoney(revenue * vatRate / 100);
      model.internal = true;
      model.number = t(d.reportNumber);
      model.numberLabel = 'Report No.';
      model.meta = compact([meta('Date', d.date, fd), meta('Project', projectName), { label: 'Distribution', value: 'Internal only' }]);
      model.keyDate = meta('Date', d.date, fd);
      model.facts = [
        { label: 'Revenue', value: esc(money(revenue, fmt)) },
        { label: 'Cost', value: esc(money(totalCost, fmt)) },
        { label: 'Gross profit', value: esc(money(profit, fmt)) },
        { label: 'Margin', value: esc(formatPercent(margin, 1)), sub: `Markup ${esc(formatPercent(markup, 1))}` },
      ];
      model.items = {
        columns: [
          { label: 'Description', align: 'left', cls: 'cd-c-desc' },
          { label: 'Cost', align: 'right', width: '15%' },
          { label: 'Charge', align: 'right', width: '15%' },
          { label: 'Profit', align: 'right', width: '15%' },
          { label: 'Margin', align: 'right', width: '11%' },
        ],
        rows: rows.map((i) => {
          const c = toNumber(i.cost);
          const r = toNumber(i.charge);
          const pr = roundMoney(r - c);
          return [`<div class="cd-item-name">${t(i.description) || '<span class="cd-muted">Item</span>'}</div>`, money(c, fmt), money(r, fmt),
            `<span class="${pr < 0 ? 'cd-neg' : ''}">${money(pr, fmt)}</span>`, r ? formatPercent((pr / r) * 100, 1) : '—'];
        }),
        emptyText: 'No items.',
      };
      model.totals = compact<TotalLine>([
        { label: 'Total cost', value: money(totalCost, fmt) },
        { label: 'Total revenue', value: money(revenue, fmt) },
        vatRate ? { label: `VAT (${formatNumber(vatRate, 2)}%)`, value: money(vat, fmt) } : null,
        vatRate ? { label: 'Revenue incl. VAT', value: money(revenue + vat, fmt) } : null,
        { label: 'Gross profit', value: money(profit, fmt), kind: 'grand' },
      ]);
      model.highlight = { label: 'Gross profit', value: esc(money(profit, fmt)) };
      model.after = compact([section('notes', 'Notes', d.notes)]);
      break;
    }
  }

  if (!model.subject && !titleIsGeneric && customTitle && customTitle !== str(model.number)) model.subject = esc(customTitle);

  // footer / running header / file name
  model.footerLine = [company.name, company.phone, company.email, company.website].filter(Boolean).join('<span class="cd-dot">·</span>');
  const plainNumber = str(
    d.invoiceNumber || d.estimateNumber || d.changeOrderNumber || d.poNumber || d.workOrderNumber || d.reportNumber
    || d.receiptNumber || d.warrantyNumber || d.timesheetNumber || '',
  ).trim();
  model.runningTitle = esc([DOC_TITLES[kind], plainNumber, clientName || projectName].filter(Boolean).join(' · '));
  const nameBits = kind === 'note'
    ? ['Note', fileSafe(d.title) || fileSafe(projectName)]
    : [DOC_TITLES[kind].replace(/\s+/g, '-'), fileSafe(plainNumber), fileSafe(clientName || projectName || d.workerName || d.vendorName || d.vendor)];
  model.fileBaseName = nameBits.filter(Boolean).join('-') || DOC_TITLES[kind].replace(/\s+/g, '-');
  return model;
};
