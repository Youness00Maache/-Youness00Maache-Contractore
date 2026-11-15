// Reminder wording: default templates, {placeholder} filling and the email body (pure, shared with the app).

import { formatMoney } from './money.ts';
import { diffDays, toYmd, type MessageTemplate, type ReminderSettings, type TemplateKey } from './schedule.ts';

export const DEFAULT_TEMPLATES: Record<TemplateKey, MessageTemplate> = {
  invoice_due: {
    subject: 'Reminder: invoice {number} is due {due_date}',
    body: [
      'Hi {client},',
      '',
      'A friendly reminder that invoice {number} for {amount} is due on {due_date}.',
      '',
      'View the invoice: {link}',
      'Pay online: {pay_link}',
      '',
      'Thank you!',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
  invoice_overdue: {
    subject: 'Invoice {number} is {days_overdue} days past due',
    body: [
      'Hi {client},',
      '',
      'Invoice {number} for {amount} was due on {due_date} and is now {days_overdue} days past due.',
      '',
      'View the invoice: {link}',
      'Pay online: {pay_link}',
      '',
      'If you have already paid, thank you, and please ignore this email.',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
  estimate: {
    subject: 'Following up on estimate {number}',
    body: [
      'Hi {client},',
      '',
      'I wanted to follow up on estimate {number} for {amount} that I sent on {sent_date}.',
      '',
      'You can review and approve it online here: {link}',
      '',
      'Happy to answer any questions.',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
  visit: {
    subject: 'Reminder: see you {visit_date}',
    body: [
      'Hi {client},',
      '',
      'A quick reminder that we are scheduled to start {job} on {visit_date}.',
      '',
      'If anything changes, just reply to this email.',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
};

export const TEMPLATE_TITLES: Record<TemplateKey, string> = {
  invoice_due: 'Invoice: before / on the due date',
  invoice_overdue: 'Invoice: overdue',
  estimate: 'Estimate follow-up',
  visit: 'Visit reminder',
};

export type PlaceholderName =
  | 'client' | 'number' | 'amount' | 'link' | 'pay_link' | 'due_date' | 'days_overdue' | 'sent_date' | 'visit_date' | 'job'
  | 'company' | 'my_name';

export const PLACEHOLDER_HELP: Record<PlaceholderName, string> = {
  client: 'Client name',
  number: 'Invoice / estimate number',
  amount: 'Balance due (invoice) or total (estimate)',
  link: 'Link to view it online',
  pay_link: 'Your “Pay now” link (invoices)',
  due_date: 'Due date',
  days_overdue: 'Days past due',
  sent_date: 'Day the estimate was sent',
  visit_date: 'Visit date',
  job: 'Job name',
  company: 'Your company',
  my_name: 'Your name',
};

export const TEMPLATE_PLACEHOLDERS: Record<TemplateKey, PlaceholderName[]> = {
  invoice_due: ['client', 'number', 'amount', 'due_date', 'link', 'pay_link', 'job', 'company', 'my_name'],
  invoice_overdue: ['client', 'number', 'amount', 'due_date', 'days_overdue', 'link', 'pay_link', 'job', 'company', 'my_name'],
  estimate: ['client', 'number', 'amount', 'sent_date', 'link', 'job', 'company', 'my_name'],
  visit: ['client', 'job', 'visit_date', 'link', 'company', 'my_name'],
};

export type ReminderValues = Partial<Record<PlaceholderName, string>>;

/** The user's template for this key, or the default when theirs is missing or empty. */
export function resolveTemplate(settings: Pick<ReminderSettings, 'templates'>, key: TemplateKey): MessageTemplate {
  const custom = settings.templates?.[key];
  const def = DEFAULT_TEMPLATES[key];
  return {
    subject: custom?.subject?.trim() ? custom.subject : def.subject,
    body: custom?.body?.trim() ? custom.body : def.body,
  };
}

const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;
// review_link: after-the-job thank-you (./postjob.ts); not used by the invoice / estimate / visit templates
const LINK_KEYS = new Set(['link', 'pay_link', 'review_link']);

/**
 * Fills {placeholders}. Unknown names are left as typed. A line whose {link}/{pay_link} is empty is dropped
 * ("Pay online:" without a link), and so is a line made only of placeholders that are all empty.
 */
export function fillTemplate(text: string, values: ReminderValues): string {
  const has = (name: string) => Object.prototype.hasOwnProperty.call(values, name);
  const out: string[] = [];
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const names = [...line.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).filter(has);
    if (names.some((n) => LINK_KEYS.has(n) && !String(values[n as PlaceholderName] ?? '').trim())) continue;
    const filled = line.replace(PLACEHOLDER_RE, (whole, name: string) => (has(name) ? String(values[name as PlaceholderName] ?? '') : whole));
    const onlyPlaceholders = names.length > 0 && !line.replace(PLACEHOLDER_RE, '').replace(/[\s,.;:–—-]/g, '');
    if (onlyPlaceholders && !filled.trim()) continue;
    out.push(filled.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

/** Plain text -> simple HTML: escaped paragraphs, line breaks kept, https links clickable. */
export function textToHtml(text: string): string {
  const paragraphs = String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const body = paragraphs
    .map((p) => {
      const html = escapeHtml(p)
        .replace(URL_RE, (url) => `<a href="${url}" style="color:#2148ed">${url}</a>`)
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">${body}</div>`;
}

export interface RenderedReminder {
  subject: string;
  text: string;
  html: string;
}

export function renderReminder(template: MessageTemplate, values: ReminderValues): RenderedReminder {
  const subject = fillTemplate(template.subject, values).replace(/\s+/g, ' ').trim().slice(0, 300);
  const text = fillTemplate(template.body, values);
  return { subject, text, html: textToHtml(text) };
}

/* ---------------------------------------------------------------------------------- values */

const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const VISIT_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const ymdDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** "November 20, 2026" */
export const formatLongDate = (value: unknown): string => {
  const ymd = toYmd(value);
  return ymd ? LONG_DATE.format(ymdDate(ymd)) : '';
};

/** "Friday, November 20" */
export const formatVisitDate = (value: unknown): string => {
  const ymd = toYmd(value);
  return ymd ? VISIT_DATE.format(ymdDate(ymd)) : '';
};

/** "Fri, Nov 20" (app lists) */
export const formatShortDate = (value: unknown): string => {
  const ymd = toYmd(value);
  return ymd ? SHORT_DATE.format(ymdDate(ymd)) : '';
};

export interface ValueContext {
  kind: 'invoice' | 'estimate' | 'visit';
  today: string;
  clientName?: string | null;
  number?: string | null;
  amount?: number | null;
  currency?: string | null;
  link?: string | null;
  payLink?: string | null;
  dueDate?: string | null;
  sentDate?: string | null;
  visitDate?: string | null;
  jobName?: string | null;
  company?: string | null;
  myName?: string | null;
}

/** https links only (plus http://localhost for previews in development). */
const httpsOnly = (url: unknown): string => {
  const s = String(url ?? '').trim();
  return /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])[^\s<>"']+$/i.test(s) ? s : '';
};

/** Values for the placeholders. Names that would read badly when empty fall back to neutral words. */
export function buildValues(ctx: ValueContext): ReminderValues {
  const due = toYmd(ctx.dueDate);
  const daysOverdue = due ? Math.max(0, diffDays(ctx.today, due)) : 0;
  const company = String(ctx.company ?? '').trim();
  const myName = String(ctx.myName ?? '').trim();
  return {
    client: String(ctx.clientName ?? '').trim() || 'there',
    number: String(ctx.number ?? '').trim(),
    amount: ctx.amount != null ? formatMoney(ctx.amount, ctx.currency || 'USD') : '',
    link: httpsOnly(ctx.link),
    pay_link: ctx.kind === 'invoice' ? httpsOnly(ctx.payLink) : '',
    due_date: ctx.kind === 'invoice' && due ? formatLongDate(due) : '',
    days_overdue: String(daysOverdue),
    sent_date: formatLongDate(ctx.sentDate),
    visit_date: formatVisitDate(ctx.visitDate),
    job: String(ctx.jobName ?? '').trim() || 'the work',
    company,
    my_name: myName && myName !== company ? myName : '',
  };
}
