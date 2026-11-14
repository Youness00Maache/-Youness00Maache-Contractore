import type { CompareContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const I2G_PRICING = 'https://invoice.2go.com/pricing/';
const CAPTERRA = 'https://www.capterra.com/p/81858/Invoice2go/pricing/';

const page: CompareContent = {
  kind: 'compare',
  key: 'compare-invoice2go-alternative',
  competitor: 'Invoice2go',
  asOf: 'November 2026',
  eyebrow: 'Invoice2go alternative',
  h1: 'An Invoice2go alternative built for contractors’ job paperwork',
  subtitle:
    'Invoice2go is an invoicing and estimating app. ContractorDocs is made for the trades: estimates clients sign, change orders, daily reports and job costing, with AI drafting. Here is a fair side-by-side, with sources.',
  answer: `ContractorDocs is an Invoice2go alternative for contractors who need estimates, invoices and construction paperwork such as change orders, work orders and daily reports, starting with a free plan. As of November 2026, Invoice2go limits invoices on its lower plans (30 a year on Starter, 100 on Professional) and keeps recurring invoices for Premium, but it processes card and PayPal payments and syncs with QuickBooks or Xero, which ContractorDocs does not.`,
  rows: [
    {
      topic: 'Price',
      us: `Free; ${PLANS.premium.name} $${PLANS.premium.monthlyPrice}/month ($${PLANS.premium.yearlyPrice}/year); ${PLANS.ai.name} $${PLANS.ai.monthlyPrice}/month ($${PLANS.ai.yearlyPrice}/year)`,
      them: 'Roughly $6–$40 a month depending on plan and billing, according to Capterra’s pricing listing',
    },
    {
      topic: 'Free plan or trial',
      us: 'Free plan with no time limit and no card',
      them: '30-day free trial; a card is needed to start it',
    },
    {
      topic: 'Invoice limits',
      us: `Free: ${FREE_LIMITS.docs} new documents per job and ${FREE_LIMITS.jobs} new jobs a month; unlimited on paid plans`,
      them: 'Starter 30 invoices a year, Professional 100 a year, Premium unlimited; estimates unlimited on every plan',
    },
    {
      topic: 'Document types',
      us: '12, made for jobs: invoices, estimates, change orders, work orders, purchase orders, daily job reports, time sheets, material and expense logs, warranties, receipts, notes',
      them: 'Invoices and estimates, plus expense tracking on every plan',
    },
    {
      topic: 'Invoice reminders',
      us: `Automatic, from your own Gmail, on every plan (on Free each reminder uses one of the ${FREE_LIMITS.emails} monthly emails)`,
      them: 'On every plan',
    },
    {
      topic: 'Recurring invoices',
      us: 'Every plan (Repeat this invoice)',
      them: 'Premium plan',
    },
    {
      topic: 'Card payments',
      us: 'A Pay now link to your own PayPal, Square, Stripe or bank link; no built-in processing and no ContractorDocs fee on payments',
      them: 'Built in: card fees of 3.5% (Starter), 3.0% (Professional) or 2.9% (Premium); PayPal 2.9% + 30¢',
    },
    {
      topic: 'Accounting sync',
      us: 'None; a monthly CSV of invoices, payments, expenses and materials for your bookkeeper',
      them: 'QuickBooks and Xero sync on Professional and Premium',
    },
    {
      topic: 'Scheduling',
      us: 'Calendar of jobs by start and end date with an assigned worker; a pipeline board from request to paid',
      them: 'Appointments and scheduling on every plan',
    },
    {
      topic: 'Job tools',
      us: 'Job costing (budget vs actual), time-and-materials invoices, job photos, inventory, price book and kits, good/better/best estimate options',
      them: 'Its pricing page centers on invoicing, estimates, payments, expenses and scheduling',
    },
    {
      topic: 'AI',
      us: `AI drafts documents from a sentence or your voice using your price book: ${FREE_LIMITS.ai}, ${PAID_AI_LIMITS.premium} or ${PAID_AI_LIMITS.ai} requests a month by plan`,
      them: 'Not covered in the sources we used',
    },
  ],
  pickThem: [
    'You mostly send invoices, not construction paperwork, and want card and PayPal payments processed inside the invoicing app.',
    'You need your invoices to sync to QuickBooks or Xero. ContractorDocs has no accounting sync yet.',
    'You want a general invoicing tool rather than one organized around jobs, clients and job-site paperwork.',
    'You send only a handful of invoices a year and want unlimited estimates on the entry plan.',
  ],
  pickUs: [
    'Your jobs need more than an invoice: estimates the client signs online, change orders, work orders, daily reports and time sheets, all tied to the job and the client.',
    `You want to start free, then pay $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month for unlimited invoices, with recurring invoices on every plan.`,
    'You want AI to draft invoices, estimates and change orders from a sentence or a voice note, with your price book prices.',
    'You want to see what each job really earns: budget vs actual and time-and-materials billing are included.',
    'You want a written price promise: existing subscribers keep their price for 12 months after any change, and data export works on every plan, even after cancelling.',
  ],
  sources: [
    { label: 'Invoice2go plans and features (invoice.2go.com/pricing)', url: I2G_PRICING },
    { label: 'Invoice2go pricing on Capterra', url: CAPTERRA },
  ],
  faq: [
    {
      q: 'Is ContractorDocs a good Invoice2go alternative for contractors?',
      a: 'If your work runs on jobs, yes. ContractorDocs puts every document on a job and a client: estimates with e-signatures, change orders, work orders, daily reports, time sheets, invoices and receipts. If you only need to send invoices and take card payments in the same app, Invoice2go may suit you better.',
    },
    {
      q: 'Does ContractorDocs limit how many invoices I can send?',
      a: `On Free you can create up to ${FREE_LIMITS.docs} new documents per job each month across ${FREE_LIMITS.jobs} new jobs a month, and send ${FREE_LIMITS.emails} emails a month from Gmail. ${PLANS.premium.name} ($${PLANS.premium.monthlyPrice} a month) removes those limits. As of November 2026, Invoice2go’s pricing page lists 30 invoices a year on Starter and 100 on Professional.`,
    },
    {
      q: 'Can I accept card payments with ContractorDocs?',
      a: 'Yes, through your own provider. Add your PayPal, Square, Stripe or bank payment link and clients get a Pay now button in the portal and the email, plus a Scan to pay code on the PDF. Fees are whatever your provider charges; ContractorDocs adds none.',
    },
    {
      q: 'Does ContractorDocs connect to QuickBooks or Xero?',
      a: 'Not yet. You can download or email your bookkeeper a monthly CSV of invoices, payments, expenses and materials, and export all of your data at any time. Invoice2go lists QuickBooks and Xero sync on its Professional and Premium plans.',
    },
  ],
  related: ['best-invoicing-software-for-contractors', 'how-to-write-a-construction-invoice', 'how-contractors-get-paid-faster'],
};

export default page;
