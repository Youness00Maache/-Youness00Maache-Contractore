import type { CompareContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const JOIST_PRICING = 'https://www.joist.com/pricing';
const WORKYARD = 'https://www.workyard.com/compare/joist-review';

const page: CompareContent = {
  kind: 'compare',
  key: 'compare-joist-alternative',
  competitor: 'Joist',
  asOf: 'November 2026',
  eyebrow: 'Joist alternative',
  h1: 'A Joist alternative with change orders and job paperwork on every plan',
  subtitle:
    'Joist is a well-liked estimate and invoice app. If you also need change orders, work orders, daily reports and AI drafting without moving up to a top plan, here is how ContractorDocs compares, with sources.',
  answer: `ContractorDocs is a Joist alternative for contractors who want estimates, invoices and the rest of the job paperwork (change orders, work orders, daily reports, time sheets) on a free plan or for $${PLANS.premium.monthlyPrice}–$${PLANS.ai.monthlyPrice} a month. As of November 2026, Joist has no free plan, starts at $8.34 a month billed yearly and keeps change orders on its Elite and Run plans, but it processes card payments and homeowner financing in the app, which ContractorDocs does not.`,
  rows: [
    {
      topic: 'Price',
      us: `Free; ${PLANS.premium.name} $${PLANS.premium.monthlyPrice}/month ($${PLANS.premium.yearlyPrice}/year); ${PLANS.ai.name} $${PLANS.ai.monthlyPrice}/month ($${PLANS.ai.yearlyPrice}/year)`,
      them: 'Basics $8.34–$12, Pro $14.17–$17, Elite $26.67–$32, Run $58.33–$100 a month (the lower figure is the yearly-billing rate)',
    },
    {
      topic: 'Free plan or trial',
      us: `Free plan with no time limit and no card: ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.clients} new clients a month`,
      them: '14-day free trial with no card; Joist says its free plan is no longer available',
    },
    {
      topic: 'Document types',
      us: '12: invoices, estimates, change orders, work orders, purchase orders, daily job reports, time sheets, material and expense logs, warranties, receipts, notes',
      them: 'Built around estimates and invoices for solo contractors',
    },
    {
      topic: 'Change orders',
      us: 'Every plan, Free included, signed by the client online',
      them: 'Elite and Run plans',
    },
    {
      topic: 'Client e-signatures',
      us: 'Every plan, in the client portal; the client signs on their phone without an account',
      them: 'In-app digital signatures are listed; the pricing page does not tie them to a plan',
    },
    {
      topic: 'Card payments',
      us: 'A Pay now link to your own PayPal, Square, Stripe or bank link; no built-in card processing. Mark as paid creates a receipt',
      them: 'Online payments on every plan; standard processing fees apply',
    },
    {
      topic: 'Homeowner financing',
      us: 'A link to your own financing partner on larger estimates',
      them: 'Homeowner financing on every plan',
    },
    {
      topic: 'Review requests',
      us: `Google review request after an invoice is paid (${PLANS.premium.name})`,
      them: 'Joist Reviews on Elite and Run',
    },
    {
      topic: 'AI',
      us: `AI drafts estimates, invoices, change orders and reports from a sentence or your voice: ${FREE_LIMITS.ai}, ${PAID_AI_LIMITS.premium} or ${PAID_AI_LIMITS.ai} requests a month by plan`,
      them: 'AI receptionist sold separately, from $49 a month',
    },
    {
      topic: 'License and insurance papers',
      us: 'License number printed on your documents; no vault for insurance certificates',
      them: 'Store license and insurance documents on Elite and Run',
    },
    {
      topic: 'Accounting',
      us: 'No QuickBooks sync; a monthly CSV of invoices, payments, expenses and materials for your bookkeeper',
      them: 'QuickBooks integration is listed in the plan comparison',
    },
    {
      topic: 'Where it runs',
      us: 'In the browser on any phone, tablet or computer (add it to your home screen); not an app-store app',
      them: 'Mobile app with about 12,600 Google Play reviews averaging 4.6 (as counted by Workyard)',
    },
  ],
  pickThem: [
    'You want a native app from the app stores. Joist has one, and in Workyard’s count of its reviews, ease of use, a professional look and fast on-site quoting were the most praised points.',
    'You want card payments and homeowner financing processed inside the app instead of through your own payment link.',
    'You need QuickBooks integration. ContractorDocs has none yet, only CSV exports for your bookkeeper.',
    'You want a phone answering service: Joist sells an AI receptionist, ContractorDocs does not have one.',
  ],
  pickUs: [
    `You want change orders, e-signatures and good/better/best options on the cheapest plan. They are on every ContractorDocs plan, Free included, and paid plans are $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month.`,
    'You need more than estimates and invoices: work orders, purchase orders, daily job reports, time sheets, material logs and warranties for the same job.',
    'You want AI to draft the estimate from a sentence or a voice note, using your own price book prices.',
    'You want job costing (budget vs actual), a pipeline board and automatic reminders sent from your own Gmail.',
    'You want to leave whenever you like: every plan can export all documents as PDFs and all data as spreadsheets, and it keeps working after you cancel.',
  ],
  sources: [
    { label: 'Joist pricing and plan comparison (joist.com/pricing)', url: JOIST_PRICING },
    { label: 'Workyard’s analysis of about 1,400 Joist reviews (Workyard sells a competing product)', url: WORKYARD },
  ],
  faq: [
    {
      q: 'Is ContractorDocs cheaper than Joist?',
      a: `Usually. ContractorDocs has a Free plan, and ${PLANS.premium.name} is $${PLANS.premium.monthlyPrice} a month or ${PLANS.ai.name} $${PLANS.ai.monthlyPrice} a month. As of November 2026, Joist’s pricing page lists Basics from $8.34, Pro from $14.17, Elite from $26.67 and Run from $58.33 a month with yearly billing, and more month to month. Card payments through Joist also carry processing fees.`,
    },
    {
      q: 'Does ContractorDocs have change orders on the free plan?',
      a: 'Yes. Change orders are one of the 12 document types on every plan. You price the added or removed work, send the approval link, and the client signs on their phone before the extra work starts. Joist lists change orders on its Elite and Run plans.',
    },
    {
      q: 'Can my clients pay by card like they do with Joist?',
      a: 'Yes, through your own payment provider. Paste your PayPal, Square, Stripe or bank payment link once in Settings and switch on the Pay now link on an invoice. The money goes straight to your account; ContractorDocs does not process cards or hold funds, so you record the payment with Mark as paid.',
    },
    {
      q: 'How do I move from Joist to ContractorDocs?',
      a: 'Start on the Free plan, import your client list from a CSV file (Clients, Import / export), add your common items to the price book, and create new estimates and invoices in ContractorDocs. Keep PDFs of your older documents from Joist for your records.',
    },
    {
      q: 'Does ContractorDocs have an app?',
      a: 'It runs in the browser on any phone, tablet or computer and can be added to your home screen like an app. Field documents and estimate and invoice drafts still save without a signal and sync later. It is not in the App Store or Google Play.',
    },
  ],
  related: ['best-invoicing-software-for-contractors', 'change-order-form-guide', 'good-better-best-pricing-for-contractors'],
};

export default page;
