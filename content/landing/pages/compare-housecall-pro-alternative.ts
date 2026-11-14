import type { CompareContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const HCP_PRICING = 'https://www.housecallpro.com/pricing/';
const HCP_FINANCING = 'https://housecallpro.com/features/consumer-financing';

const page: CompareContent = {
  kind: 'compare',
  key: 'compare-housecall-pro-alternative',
  competitor: 'Housecall Pro',
  asOf: 'November 2026',
  eyebrow: 'Housecall Pro alternative',
  h1: 'A Housecall Pro alternative for small contractors who live in estimates and invoices',
  subtitle:
    'Housecall Pro runs home-service companies: dispatch, GPS, payments, financing and reviews. If you are a small crew that mainly needs signed estimates, change orders and invoices, here is how ContractorDocs compares, with sources.',
  answer: `ContractorDocs is a Housecall Pro alternative for small contractors who mainly need estimates, invoices, change orders and daily job paperwork, with e-signatures, reminders and AI drafting, for $0–$${PLANS.ai.monthlyPrice} a month. As of November 2026, Housecall Pro starts at $59 a month billed yearly for one user and keeps side-by-side proposal options and service plans on MAX ($299+), but it includes card processing, consumer financing, review management and online booking on every plan.`,
  rows: [
    {
      topic: 'Price',
      us: `Free; ${PLANS.premium.name} $${PLANS.premium.monthlyPrice}/month; ${PLANS.ai.name} $${PLANS.ai.monthlyPrice}/month, for the whole account`,
      them: 'Basic $59/month billed yearly ($79 monthly) for 1 user; Essentials $149 ($189) for 5 users; MAX $299 ($329) for 8 users',
    },
    {
      topic: 'Free plan or trial',
      us: 'Free plan with no time limit and no card',
      them: '14-day free trial, no card',
    },
    {
      topic: 'Invoice reminders',
      us: 'Automatic on every plan, sent from your own Gmail',
      them: 'Automated invoice reminders on every plan',
    },
    {
      topic: 'Options on estimates',
      us: 'Good/better/best options on every plan; the client compares, picks and signs',
      them: 'Side-by-side proposal options on MAX; Basic and Essentials have quotes and estimates',
    },
    {
      topic: 'Change orders and daily reports',
      us: 'Both are document types on every plan, with client signatures on change orders',
      them: 'Not covered in the sources we used',
    },
    {
      topic: 'Card payments',
      us: 'A Pay now link to your own PayPal, Square, Stripe or bank link; no built-in processing',
      them: 'Built-in card processing from 2.59% on every plan',
    },
    {
      topic: 'Consumer financing',
      us: 'A link to your own financing partner on larger estimates',
      them: 'Built-in consumer financing on every plan',
    },
    {
      topic: 'Reviews',
      us: `Google review request after an invoice is paid (${PLANS.premium.name})`,
      them: 'Review management on every plan',
    },
    {
      topic: 'New customer requests',
      us: 'A request-a-quote link and printable QR sign; customers send the job, address and up to 5 photos',
      them: 'Online booking on every plan',
    },
    {
      topic: 'QuickBooks',
      us: 'No sync; a monthly CSV for your bookkeeper and export of all data',
      them: 'QuickBooks sync from Essentials',
    },
    {
      topic: 'Service plans and GPS',
      us: 'Recurring invoices on every plan; no recurring visit plans and no GPS tracking',
      them: 'Recurring service plans on MAX; phone-based employee GPS from Essentials',
    },
    {
      topic: 'AI',
      us: `AI drafts estimates, invoices, change orders and reports from a sentence or your voice with your price book prices: ${FREE_LIMITS.ai}, ${PAID_AI_LIMITS.premium} or ${PAID_AI_LIMITS.ai} requests a month by plan`,
      them: 'AI features included on all plans; CSR AI (answers customers) is an add-on with no published price',
    },
  ],
  pickThem: [
    'You run a home-service company with several technicians who need dispatch, GPS and their own logins.',
    'You want card processing, consumer financing and review management built in on every plan.',
    'You sell maintenance memberships and want recurring service plans with scheduled visits.',
    'You want customers to book online and an AI that answers them for you.',
  ],
  pickUs: [
    `You are a small crew and the job is mostly paperwork: ContractorDocs is $0, $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month for the whole account.`,
    'You want good/better/best options without moving to a top plan: they are on every ContractorDocs plan, Free included.',
    'Your jobs need construction documents: change orders, work orders, purchase orders, daily job reports, time sheets, material logs and warranties.',
    'You want AI to draft the paperwork from a sentence or a voice note, with your own price book prices.',
    'You want job costing (budget vs actual), time-and-materials invoices and a pipeline board included, and the option to export everything whenever you like.',
  ],
  sources: [
    { label: 'Housecall Pro pricing and plan comparison (housecallpro.com/pricing)', url: HCP_PRICING },
    { label: 'Housecall Pro consumer financing', url: HCP_FINANCING },
  ],
  faq: [
    {
      q: 'Is ContractorDocs cheaper than Housecall Pro?',
      a: `Yes, by a wide margin for a small team: ContractorDocs is Free, $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month. As of November 2026, Housecall Pro’s pricing page lists Basic at $59 a month billed yearly for one user, Essentials at $149 for five and MAX at $299 for eight. Housecall Pro includes payment processing, financing and dispatch tools that ContractorDocs does not have.`,
    },
    {
      q: 'Does ContractorDocs offer customer financing?',
      a: 'Not as a built-in lender. You can add a link to your own financing partner in Settings, and it appears on estimates above the amount you choose. Housecall Pro offers consumer financing on every plan.',
    },
    {
      q: 'Can I get good/better/best options without a top plan?',
      a: 'Yes. In ContractorDocs, Good / better / best turns an estimate into three options with their own lines and totals on every plan. The client picks one in the approval link and signs, and Apply chosen option makes it the estimate’s total. Housecall Pro lists side-by-side proposal options on MAX.',
    },
    {
      q: 'Does ContractorDocs have dispatch and GPS?',
      a: 'No. It has a job calendar with an assigned worker and a pipeline board, but no dispatch board, route planning or GPS tracking. If you dispatch several technicians every day, a field-service platform like Housecall Pro fits better.',
    },
  ],
  related: ['best-invoicing-software-for-contractors', 'good-better-best-pricing-for-contractors', 'how-contractors-get-paid-faster'],
};

export default page;
