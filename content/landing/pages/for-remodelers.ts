import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-remodelers',
  trade: 'remodelers',
  eyebrow: 'For remodelers',
  h1: 'Remodeling paperwork from first estimate to final payment',
  subtitle:
    'Kitchens, baths and whole-home projects run for weeks and change along the way. Keep the estimate, every signed change order, progress invoices, daily reports and the job’s real costs in one place.',
  answer:
    'Remodelers need more than an invoice app: allowances on the estimate, a signed change order for every scope change, progress billing by percent complete and a running budget against actual costs. ContractorDocs keeps all of it on the job, gets estimates and change orders signed online, and shows when costs are running ahead of the work.',
  documents: [
    {
      name: 'Estimate with allowances',
      use: 'Scope by phase (demo, rough-in, tile, finish) with allowance lines for the vanity, fixtures and tile the client still has to choose, and what happens if their selection costs more.',
    },
    {
      name: 'Change order',
      use: 'Every scope change: a moved wall, an upgraded tile, rot under the subfloor. Price, schedule impact and the client’s signature, before the extra work starts.',
    },
    {
      name: 'Progress invoice',
      use: 'Bill by percent complete per line (for example 30% deposit, 40% at rough-in inspection, 30% at completion), minus what you already billed, so the balance is always right.',
    },
    {
      name: 'Daily job report',
      use: 'Who was on site, hours, weather, what got done, inspections, deliveries and photos. It is the project diary you need when a schedule or quality question comes up.',
    },
    {
      name: 'Purchase order and material log',
      use: 'Order cabinets and tile against the job, log what was used, and see it in the job’s costs.',
    },
    {
      name: 'Warranty',
      use: 'A workmanship warranty at closeout with coverage, length, exclusions and how to make a claim, handed over with the final invoice.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: 'Primary bathroom remodel',
    lines: [
      { description: 'Demolition, protection and haul-away', qty: 1, unit: 'job', rate: 1800 },
      { description: 'Plumbing rough-in, relocate vanity drain', qty: 1, unit: 'job', rate: 1650 },
      { description: 'Shower pan, waterproofing and wall tile install', qty: 96, unit: 'sq ft', rate: 24 },
      { description: 'Floor tile install', qty: 60, unit: 'sq ft', rate: 18 },
      { description: 'Vanity and top allowance (client selection)', qty: 1, unit: 'allowance', rate: 1200 },
      { description: 'Plumbing fixture allowance', qty: 1, unit: 'allowance', rate: 900 },
      { description: 'Electrical: vanity light, exhaust fan, GFCI outlets', qty: 1, unit: 'job', rate: 950 },
      { description: 'Drywall repair, paint and trim', qty: 1, unit: 'job', rate: 700 },
    ],
    note: 'If selections cost more than the allowance, the difference is billed by change order. Payment schedule: 30% deposit, 40% at rough-in inspection, 30% at completion.',
  },
  workflow: [
    {
      title: 'Signed change orders, linked to the budget',
      text: 'Create a Change Order on the job with what is added or removed and its cost, and send the approval link. When the client signs, it is added to the job’s budget. Signed estimates and change orders lock; **Revise** starts a new revision that needs a new signature.',
    },
    {
      title: 'Progress billing that adds up',
      text: 'Switch an invoice to progress billing and bill each line by percent complete. Previously billed amounts are subtracted, deposits are recorded, and the client can pay through your Pay now link. Automatic reminders follow up from your Gmail if a draw is late.',
    },
    {
      title: 'Budget vs actual while the job runs',
      text: '**Financials** shows the budget (accepted estimate plus approved change orders) split into labor, materials, expenses and subs, next to what the job has really cost from time sheets, material logs, expense logs and sent purchase orders. If more of the budget is used than the job is complete, “Costs are ahead of the work” shows in red.',
    },
    {
      title: 'Daily reports and client updates from photos',
      text: 'Tag job photos Before, During and After and share the ones you choose in the client portal. With Premium + AI, **Write client update** turns the day’s photos and a short note into an update you can send by Gmail, text or WhatsApp, and **AI walkthrough** drafts the daily report.',
    },
  ],
  tips: [
    'Write allowances as a dollar amount with what it covers (“vanity and top, up to $1,200”) and say how overages are billed.',
    'Never start changed work on a verbal yes. A signed change order with the new total and schedule impact is what gets paid without an argument.',
    'Tie progress payments to milestones the client can see, such as rough-in inspection passed, instead of dates.',
    'Log daily reports even on quiet days; a gap in the record is what hurts in a dispute.',
    'Check whether your state requires specific contract language or lien notices for home improvement work before you finalize your estimate template.',
  ],
  faq: [
    {
      q: 'How should remodelers handle allowances?',
      a: 'List each allowance as its own line with a dollar amount and what it covers, and state that selections above the allowance are billed by change order. In ContractorDocs the allowance is a normal estimate line; the difference becomes a change order the client signs online. See [change orders that get paid](/blog/change-order-form-guide).',
    },
    {
      q: 'Can I bill a remodel in progress payments?',
      a: 'Yes. Progress billing bills each line by percent complete and subtracts what you already billed, so every draw is correct. The client portal shows the outstanding balance and a Pay now button for your own payment link. Our guide on [getting paid faster](/blog/how-contractors-get-paid-faster) covers deposit and draw schedules.',
    },
    {
      q: 'How do I know if a remodel is still profitable?',
      a: 'Compare the budget with actual costs while the job is running, not after. ContractorDocs’ job Financials does this from your time sheets, material logs, expenses and purchase orders, and Bill time & materials turns unbilled hours and materials into a draft invoice. Read [how to calculate job profit margin](/blog/how-to-calculate-job-profit-margin).',
    },
    {
      q: 'Can clients see project documents and photos?',
      a: 'Yes. Each client has a private portal with their balance, documents waiting for a signature, PDFs to download and the job photos you chose to share. Drafts and internal documents such as expense logs and purchase orders stay hidden.',
    },
    {
      q: 'How much does ContractorDocs cost for a remodeling company?',
      a: `Free is $0, Premium is $${PLANS.premium.monthlyPrice} a month and Premium + AI is $${PLANS.ai.monthlyPrice} a month. The Free plan allows ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.clients} new clients each month. See [pricing](/pricing).`,
    },
  ],
  related: ['change-order-form-guide', 'daily-job-report-template', 'how-to-calculate-job-profit-margin', 'lien-waivers-explained'],
};

export default page;
