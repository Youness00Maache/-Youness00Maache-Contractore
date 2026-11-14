import type { CompareContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const JOBBER_PRICING = 'https://www.getjobber.com/pricing/';
const JOBBER_LLM = 'https://www.getjobber.com/llm-info/';
const JOBBER_AI_QUOTES = 'https://productupdates.getjobber.com/111090-quote-faster-and-win-more-work-with-new-automations';
const FIELDCAMP = 'https://fieldcamp.ai/reviews/jobber';

const page: CompareContent = {
  kind: 'compare',
  key: 'compare-jobber-alternative',
  competitor: 'Jobber',
  asOf: 'November 2026',
  eyebrow: 'Jobber alternative',
  h1: 'A Jobber alternative for one-to-five-person contractors',
  subtitle:
    'Jobber is a full field-service platform for home-service teams. If what you need most is paperwork that gets signed and paid, at a small-business price, here is how ContractorDocs compares, with sources.',
  answer: `ContractorDocs is a Jobber alternative for small contractors who mainly need estimates, invoices, change orders and job paperwork, with e-signatures, reminders and AI drafting, for $0–$${PLANS.ai.monthlyPrice} a month. As of November 2026, Jobber starts at $29 a month (billed yearly) for one user and puts automatic follow-ups on Connect ($99+) and job costing and optional line items on Grow ($149+), but it includes built-in card payments, online booking and multi-user scheduling that ContractorDocs does not have.`,
  rows: [
    {
      topic: 'Price for one person',
      us: `Free; ${PLANS.premium.name} $${PLANS.premium.monthlyPrice}/month; ${PLANS.ai.name} $${PLANS.ai.monthlyPrice}/month`,
      them: 'Core $29/month billed yearly ($49 month to month); Connect from $99; Grow from $149',
    },
    {
      topic: 'More people',
      us: 'One login per account; workers are names on jobs, work orders and time sheets, with no per-person fee',
      them: 'Extra users $29/month each; Plus from $399/month for 5 users',
    },
    {
      topic: 'Free plan or trial',
      us: 'Free plan with no time limit and no card',
      them: '14-day trial with Grow features, no card',
    },
    {
      topic: 'Automatic reminders and follow-ups',
      us: `Every plan, sent from your own Gmail (on Free each one uses one of the ${FREE_LIMITS.emails} monthly emails)`,
      them: 'From Connect ($99/month billed yearly)',
    },
    {
      topic: 'Options on a quote',
      us: 'Good/better/best options on every plan; the client picks one and signs',
      them: 'Optional line items from Grow ($149/month billed yearly)',
    },
    {
      topic: 'Job costing',
      us: 'Budget vs actual and time-and-materials invoices on every plan',
      them: 'From Grow; profit alerts on Plus',
    },
    {
      topic: 'Change orders',
      us: 'One of 12 document types on every plan, signed by the client online',
      them: 'A review by FieldCamp, which sells a competing product, says Jobber’s quoting has no change-order support',
    },
    {
      topic: 'Card payments',
      us: 'A Pay now link to your own PayPal, Square, Stripe or bank link; no built-in processing. Record payments with Mark as paid',
      them: 'Built in on all plans: cards 2.9% + 30¢, Tap to Pay 2.7% + 30¢, bank (ACH) 1%',
    },
    {
      topic: 'New customer requests',
      us: 'A request-a-quote link and printable QR sign: customers send the job, address and up to 5 photos',
      them: 'Online booking from Core',
    },
    {
      topic: 'QuickBooks',
      us: 'No sync; a monthly CSV for your bookkeeper and export of all data',
      them: 'QuickBooks Online sync from Connect',
    },
    {
      topic: 'AI',
      us: `AI drafts estimates, invoices, change orders and reports from a sentence or your voice with your price book prices: ${FREE_LIMITS.ai}, ${PAID_AI_LIMITS.premium} or ${PAID_AI_LIMITS.ai} requests a month by plan`,
      them: 'AI that drafts quotes from requests (Jobber’s product updates); AI Receptionist add-on $29/month; Marketing Suite add-on $99/month',
    },
    {
      topic: 'Texting clients',
      us: 'Text and WhatsApp buttons open your own phone’s messaging app with the portal link filled in',
      them: 'Two-way texting from Grow',
    },
  ],
  pickThem: [
    'You run several crews and need dispatch, routing and a login for each office and field person. ContractorDocs has one login per account.',
    'You want card, Tap to Pay and bank payments built in, with invoices marked paid automatically when the money arrives.',
    'You want customers to book visits online straight into your schedule, or an AI receptionist to answer calls.',
    'You need QuickBooks Online sync today.',
  ],
  pickUs: [
    `You are one to five people and spend more time on paperwork than on dispatch: ContractorDocs is $0, $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month, not per user.`,
    'You want reminders, good/better/best options, change orders and job costing on the cheapest plan instead of two tiers up.',
    'Your jobs need construction documents: change orders, work orders, purchase orders, daily job reports, time sheets, material logs and warranties.',
    'You want AI to draft the paperwork from a sentence or a voice note, with your own price book prices, on every plan.',
    'You want to send from your own Gmail and your own phone, get paid into your own payment account, and export everything whenever you like.',
  ],
  sources: [
    { label: 'Jobber pricing and plan features (getjobber.com/pricing)', url: JOBBER_PRICING },
    { label: 'Jobber feature summary for AI assistants (getjobber.com/llm-info)', url: JOBBER_LLM },
    { label: 'Jobber product update: quotes drafted from requests', url: JOBBER_AI_QUOTES },
    { label: 'FieldCamp review of Jobber (FieldCamp sells a competing product)', url: FIELDCAMP },
  ],
  faq: [
    {
      q: 'Is ContractorDocs cheaper than Jobber?',
      a: `For one to five people, yes. ContractorDocs is Free, $${PLANS.premium.monthlyPrice} or $${PLANS.ai.monthlyPrice} a month for the whole account. As of November 2026, Jobber’s pricing page lists Core at $29 a month billed yearly for one user, Connect from $99 and Grow from $149, with extra users at $29 a month each. Jobber also includes payment processing and scheduling tools that ContractorDocs does not have.`,
    },
    {
      q: 'Does ContractorDocs do scheduling and dispatch like Jobber?',
      a: 'Only the basics. There is a calendar of jobs by start and end date with an assigned worker, and a pipeline board that moves jobs from request to paid by itself. There is no route planning, GPS or per-worker login, so a company that dispatches several crews is better served by a field-service platform.',
    },
    {
      q: 'Can I send automatic invoice reminders without paying for a higher plan?',
      a: `Yes. ContractorDocs reminders are on every plan: unpaid invoices on the due date and 7 and 14 days later, and estimate follow-ups 3 and 7 days after sending, all from your own Gmail. On Free each reminder counts toward the ${FREE_LIMITS.emails} emails a month.`,
    },
    {
      q: 'Can clients pay online with ContractorDocs?',
      a: 'Yes, through your own payment provider. Add your PayPal, Square, Stripe or bank link and clients get a Pay now button and a Scan to pay code. ContractorDocs does not process cards, so payments are not marked paid by themselves: the client can tap I’ve paid, and you confirm with Mark as paid.',
    },
    {
      q: 'Can I switch from Jobber to ContractorDocs?',
      a: 'Yes. Import your clients from a CSV file (Clients, Import / export), set up your price book, and create new estimates and invoices in ContractorDocs. Keep PDFs of your Jobber history for your records.',
    },
  ],
  related: ['best-invoicing-software-for-contractors', 'job-costing-budget-vs-actual', 'contractor-app-that-works-offline'],
};

export default page;
