/**
 * Marketing-site constants and copy that is shared between pages, the prerenderer and the sitemap.
 * Keep claims factual: no invented customer counts, ratings or testimonials.
 */
export const SITE = {
  name: 'ContractorDocs',
  url: 'https://www.contractordocs.app',
  email: 'support@contractordocs.app',
  /** Last content revision of the marketing pages (YYYY-MM-DD). */
  lastUpdated: '2026-11-12',
  /** Revision date shown on Privacy / Terms / Security. */
  legalUpdated: '2026-11-12',
  year: 2026,
  ogImage: 'https://www.contractordocs.app/og-image.png',
  logo: 'https://www.contractordocs.app/icon-512.png',
  tagline: 'Professional contractor paperwork in minutes',
  description:
    'Create invoices, estimates, work orders, change orders and daily job reports in minutes. AI drafting, e-signatures, a client portal and Gmail sending, built for contractors.',
} as const;

export const SIGNUP_PATH = '/auth/signup';
export const LOGIN_PATH = '/auth/login';

export type DocIconName =
  | 'invoice' | 'estimate' | 'workOrder' | 'changeOrder' | 'purchaseOrder' | 'dailyReport'
  | 'timeSheet' | 'materialLog' | 'expenseLog' | 'warranty' | 'receipt' | 'note';

export interface DocumentTypeInfo {
  id: DocIconName;
  name: string;
  summary: string;
  /** Where to learn more: a keyword page or a guide. */
  href: string;
  hrefLabel: string;
  fields: string[];
}

export const DOCUMENT_TYPES: DocumentTypeInfo[] = [
  { id: 'invoice', name: 'Invoice', summary: 'Itemized bills with tax, discounts, deposits and progress billing, so the balance due is always right.', href: '/invoice-generator', hrefLabel: 'Invoice generator', fields: ['Line items & tax', 'Deposits & balance due', 'Progress billing'] },
  { id: 'estimate', name: 'Estimate', summary: 'Clear, professional quotes clients can approve and sign online before you start.', href: '/estimate-generator', hrefLabel: 'Estimate generator', fields: ['Scope & pricing', 'Valid-until date', 'Client approval'] },
  { id: 'workOrder', name: 'Work Order', summary: 'Tell the crew exactly what to do, where and when, and capture sign-off when it is done.', href: '/blog/work-order-template', hrefLabel: 'Work order guide', fields: ['Tasks & location', 'Assigned crew', 'Completion sign-off'] },
  { id: 'changeOrder', name: 'Change Order', summary: 'Price scope changes and get them signed before the extra work starts.', href: '/blog/change-order-form-guide', hrefLabel: 'Change order guide', fields: ['Added / removed work', 'Cost & schedule impact', 'Client signature'] },
  { id: 'purchaseOrder', name: 'Purchase Order', summary: 'Order materials from suppliers with quantities and prices tied to the job.', href: '/blog/contractor-purchase-orders', hrefLabel: 'Purchase order guide', fields: ['Supplier & delivery', 'Quantities & prices', 'Job reference'] },
  { id: 'dailyReport', name: 'Daily Job Report', summary: 'Record crew, weather, work completed, delays and photos every day on site.', href: '/blog/daily-job-report-template', hrefLabel: 'Daily report guide', fields: ['Crew & hours', 'Weather & delays', 'Photos'] },
  { id: 'timeSheet', name: 'Time Sheet', summary: 'Track hours per worker and per job for payroll and job costing.', href: '/blog/construction-time-sheet-tracking', hrefLabel: 'Time sheet guide', fields: ['Hours per worker', 'Overtime', 'Job & task'] },
  { id: 'materialLog', name: 'Material Log', summary: 'Log materials delivered and used, linked to your inventory and price book.', href: '/blog/material-log-job-costing', hrefLabel: 'Material log guide', fields: ['Items & quantities', 'Unit costs', 'Inventory link'] },
  { id: 'expenseLog', name: 'Expense Log', summary: 'Capture job expenses and receipts so every cost lands on the right job.', href: '/blog/how-to-calculate-job-profit-margin', hrefLabel: 'Job profit guide', fields: ['Vendor & category', 'Amount & date', 'Receipt photo'] },
  { id: 'warranty', name: 'Warranty', summary: 'Hand over a professional workmanship warranty with coverage and exclusions.', href: '/blog/contractor-warranty-letter-template', hrefLabel: 'Warranty guide', fields: ['Coverage & term', 'Exclusions', 'Claim process'] },
  { id: 'receipt', name: 'Receipt', summary: 'Confirm payments received with a clean, numbered receipt.', href: '/blog/how-contractors-get-paid-faster', hrefLabel: 'Getting paid guide', fields: ['Amount received', 'Payment method', 'Remaining balance'] },
  { id: 'note', name: 'Note', summary: 'Keep site notes, meeting minutes and client conversations with the job.', href: '/blog/contractor-paperwork-checklist', hrefLabel: 'Paperwork checklist', fields: ['Rich text', 'Attached to the job', 'Shareable PDF'] },
];

export type TradeIconName = 'gc' | 'remodel' | 'electric' | 'plumbing' | 'hvac' | 'roofing' | 'landscaping' | 'handyman';

export const TRADES: { id: TradeIconName; name: string }[] = [
  { id: 'gc', name: 'General contractors' },
  { id: 'remodel', name: 'Remodelers' },
  { id: 'electric', name: 'Electricians' },
  { id: 'plumbing', name: 'Plumbers' },
  { id: 'hvac', name: 'HVAC' },
  { id: 'roofing', name: 'Roofers' },
  { id: 'landscaping', name: 'Landscapers' },
  { id: 'handyman', name: 'Handymen' },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const HOME_FAQ: FaqItem[] = [
  { q: 'Is ContractorDocs really free to start?', a: 'Yes. The Free plan includes all 12 document types, PDF export and a monthly allowance of jobs, clients, documents and AI requests. No credit card is needed to sign up. Upgrade only when you need unlimited use.' },
  { q: 'What kinds of documents can I create?', a: 'Invoices, estimates, work orders, change orders, purchase orders, daily job reports, time sheets, material logs, expense logs, warranties, receipts and notes. Every document is attached to a job and a client, and exports to a professional PDF with your logo.' },
  { q: 'How does the AI assistant work?', a: 'Describe the job in plain words, or dictate it, and the assistant drafts the document for you: line items, descriptions, notes and dates. You always review and edit the draft before anything is saved or sent. The assistant is powered by Google Gemini.' },
  { q: 'Can my clients sign estimates and change orders online?', a: 'Yes. Send a secure client-portal link. Your client can view the document, approve it and sign on their phone or computer without creating an account. You see the signature, name and time on the document.' },
  { q: 'Do emails come from my own address?', a: 'Yes. Connect your Gmail account and ContractorDocs sends documents as PDF attachments from your own address, so replies come straight back to your inbox. We only ask Google for permission to send email, not to read your inbox.' },
  { q: 'Does it work on my phone?', a: 'Yes. ContractorDocs runs in the browser on phones, tablets and computers, and you can add it to your home screen. Create a daily report on site and finish the invoice at your desk.' },
  { q: 'Can I take card payments through ContractorDocs?', a: 'Not directly. ContractorDocs is for creating, sending and tracking paperwork. Add your payment instructions or payment link to your invoices, and record deposits and payments so the balance due stays accurate.' },
  { q: 'Is my data secure?', a: 'Your data is stored in a managed Postgres database with per-account access rules, encrypted in transit, and long-lived Gmail tokens are encrypted and kept on the server. Read the details on our Security page.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Paid plans are month-to-month or yearly and you can cancel at any time from Settings. You keep paid features until the end of the period you paid for, then your account moves to the Free plan. Your documents stay available.' },
  { q: 'Who handles billing?', a: 'Payments are processed by Kelviq, our merchant of record. Kelviq handles checkout, sales tax/VAT and receipts; ContractorDocs never sees your full card number.' },
];

export const PRICING_FAQ: FaqItem[] = [
  { q: 'Do I need a credit card for the Free plan?', a: 'No. Create an account with your email or Google and start right away. You only enter payment details if you choose to upgrade.' },
  { q: 'What happens when I reach a Free plan limit?', a: 'Nothing you have created is lost. You will be asked to upgrade before creating more of that item this month; monthly limits reset at the start of each calendar month.' },
  { q: 'What is the difference between Premium and Premium + AI?', a: 'Both include unlimited jobs, clients and documents, every template, Gmail sending, the client portal and e-signatures. Premium + AI adds a much larger monthly AI allowance plus AI batch emails and voice dictation, for contractors who want the assistant to write most of their paperwork.' },
  { q: 'Who processes my payment?', a: 'Kelviq is our merchant of record. Kelviq processes the payment, calculates and remits applicable sales tax or VAT, and sends your receipts. Prices are shown in US dollars; taxes may be added at checkout depending on where you are.' },
  { q: 'Can I switch between monthly and yearly or cancel?', a: 'Yes. You can change or cancel your plan from Settings at any time. Cancellation takes effect at the end of the current billing period and you keep access until then.' },
  { q: 'Do you offer refunds?', a: 'If you think you were charged in error, email support@contractordocs.app and we will review it with you. Any refund is issued through Kelviq to your original payment method.' },
];
