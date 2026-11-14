import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-landscapers',
  trade: 'landscapers',
  eyebrow: 'For landscapers',
  h1: 'Landscaping estimates, seasonal invoices and crew hours in one app',
  subtitle:
    'Turn bed measurements into cubic yards of mulch and soil, quote installs with options, bill weekly maintenance on a schedule and know what each crew-day really cost.',
  answer:
    'Landscapers need two kinds of paperwork: project estimates for installs and hardscapes, and repeating invoices for maintenance. ContractorDocs handles both: Quick measure converts beds and areas into cubic yards, estimates can offer good/better/best plant or material options, invoices repeat on a schedule, and time sheets and material logs show each job’s real cost.',
  documents: [
    {
      name: 'Estimate',
      use: 'Installs, cleanups and hardscapes: mulch and soil by the cubic yard, sod by the square foot, edging by the linear foot, plants by size, plus delivery and disposal.',
    },
    {
      name: 'Repeating invoice',
      use: 'Weekly or bi-weekly mowing and maintenance billed every month with **Repeat this invoice**, so seasonal contracts are invoiced on time without retyping.',
    },
    {
      name: 'Time sheet',
      use: 'Hours per worker and per job, with overtime, so payroll is right and you see which properties take longer than you priced.',
    },
    {
      name: 'Material log',
      use: 'Yards of mulch, bags of fertilizer and plants installed on each property, tied to your inventory and price book.',
    },
    {
      name: 'Work order',
      use: 'The crew’s list for the day: property, gate code, what to mow, trim and haul, and what not to touch, signed off when done.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: 'Spring cleanup and mulch install',
    lines: [
      { description: 'Spring cleanup: leaves, debris, bed edging', qty: 1, unit: 'job', rate: 450 },
      { description: 'Hardwood mulch, delivered', qty: 9, unit: 'cu yd', rate: 55 },
      { description: 'Mulch install labor, 3 in depth', qty: 9, unit: 'cu yd', rate: 45 },
      { description: 'Shrub pruning and shaping', qty: 14, unit: 'ea', rate: 12 },
      { description: 'Pre-emergent weed treatment, beds', qty: 1, unit: 'job', rate: 120 },
      { description: 'Green waste disposal', qty: 1, unit: 'load', rate: 85 },
    ],
    note: 'Mulch: 960 sq ft of beds at 3 in deep = 8.9 cu yd, rounded up to 9. Weekly mowing from May to October is billed monthly on a separate invoice.',
  },
  workflow: [
    {
      title: 'Cubic yards without a calculator',
      text: 'Tap **Measure** on a line and choose Volume: length × width × depth gives cubic yards for mulch, soil, gravel or concrete. Area mode adds and subtracts rectangles and triangles for sod and seed, and Linear adds up edging. Add a waste percentage and the quantity lands on the line with its unit.',
    },
    {
      title: 'Maintenance that invoices itself',
      text: 'Set the monthly maintenance invoice to repeat on a schedule and turn on automatic reminders, which email the client from your own Gmail if it goes unpaid and stop when it is paid. Clients pay through your own payment link; **Mark as paid** records it and creates the receipt.',
    },
    {
      title: 'Crew hours and materials per property',
      text: 'Fill a time sheet per worker and job and log materials as they go out. Job **Financials** subtracts labor (hours × your labor rate, overtime at 1.5×), materials and expenses from what you billed, and **Bill time & materials** turns unbilled hours and materials into a draft invoice for extra work.',
    },
    {
      title: 'Installs with options and photos',
      text: 'Quote a planting or patio with good/better/best options (for example plant sizes or paver grades), let the client pick and sign online, and show the finished job with Before and After photos in the client portal.',
    },
  ],
  tips: [
    'Write mulch and soil in cubic yards with the depth, not just “mulch beds”. The client sees what they are paying for and the crew knows how much to load.',
    'Keep maintenance and project work on separate invoices. Maintenance repeats; installs are one-off and often need a deposit.',
    'Note plant warranties and their conditions (for example “watering is the owner’s responsibility”) on the estimate and the warranty letter.',
    'Track crew hours per property for a few weeks. It is the quickest way to find the accounts you are under-pricing.',
  ],
  faq: [
    {
      q: 'How do I calculate cubic yards of mulch for an estimate?',
      a: 'Multiply the bed area in square feet by the depth in feet, then divide by 27. For example, 960 sq ft at 3 inches (0.25 ft) is 240 cubic feet, or about 8.9 cubic yards. ContractorDocs’ Quick measure does it in Volume mode and puts the yards on the estimate line.',
    },
    {
      q: 'Can I bill maintenance clients automatically every month?',
      a: 'Yes. An invoice can repeat on a schedule, and automatic reminders follow up from your Gmail if it is not paid. Payments come in through your own payment link, and you record them with Mark as paid.',
    },
    {
      q: 'Can I track crew hours by job?',
      a: 'Yes. Time sheets record hours per worker and per job, including overtime, and feed the job’s labor cost in Financials. Read our guide to [construction time sheets](/blog/construction-time-sheet-tracking).',
    },
    {
      q: 'Does it work in the field without signal?',
      a: 'Field documents such as time sheets, material logs, daily reports and notes still save on your device when there is no signal, with a Waiting to sync badge, and sync when you are back online. The app runs in the browser on your phone and can be added to the home screen.',
    },
    {
      q: 'How much does it cost?',
      a: `Free is $0 with ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.clients} new clients a month. Premium is $${PLANS.premium.monthlyPrice} a month (or $${PLANS.premium.yearlyPrice} a year) with no monthly limits, and Premium + AI is $${PLANS.ai.monthlyPrice} a month. See [pricing](/pricing).`,
    },
  ],
  related: ['construction-time-sheet-tracking', 'material-log-job-costing', 'construction-estimate-template', 'how-contractors-get-paid-faster'],
};

export default page;
