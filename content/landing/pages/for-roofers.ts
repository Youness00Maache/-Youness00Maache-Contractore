import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-roofers',
  trade: 'roofers',
  eyebrow: 'For roofing contractors',
  h1: 'Roofing estimates by the square, with photos that back up every line',
  subtitle:
    'Measure the roof, price shingles, underlayment and flashing from your price book, collect the deposit at signing and document the rotten decking before the homeowner asks why the bill changed.',
  answer:
    'A good roofing estimate turns measurements into squares with waste included, lists tear-off, underlayment, flashing and ventilation as separate lines, and says up front how rotten decking will be priced. ContractorDocs calculates squares from plan area and pitch, builds the estimate from your price book, gets it signed online and turns hidden damage into a photo-backed change order.',
  documents: [
    {
      name: 'Estimate',
      use: 'Re-roofs and repairs priced per square, with the number of layers to tear off, shingle line, underlayment, ice and water shield, drip edge and ridge vent, plus a per-sheet decking price for anything found rotten.',
    },
    {
      name: 'Change order',
      use: 'Rotten decking, a second layer nobody mentioned or extra flashing at a chimney. Attach the photos and get the homeowner’s signature before the crew closes it up.',
    },
    {
      name: 'Daily job report',
      use: 'Crew on site, weather, squares torn off and dried in, deliveries and photos. It is the record you want if a storm hits mid-job.',
    },
    {
      name: 'Invoice',
      use: 'The deposit invoice at signing, then the balance at completion with the deposit already deducted and the approved change orders added.',
    },
    {
      name: 'Warranty',
      use: 'Your workmanship warranty, separate from the shingle manufacturer’s warranty, with what voids it and how to make a claim.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: 'Asphalt shingle re-roof, 24 squares, 6/12 pitch',
    lines: [
      { description: 'Tear off one layer of shingles, haul away', qty: 24, unit: 'sq', rate: 85 },
      { description: 'Architectural shingles, supply & install (incl. 10% waste)', qty: 26, unit: 'sq', rate: 310 },
      { description: 'Synthetic underlayment', qty: 26, unit: 'sq', rate: 35 },
      { description: 'Ice and water shield at eaves and valleys', qty: 6, unit: 'roll', rate: 95 },
      { description: 'Drip edge', qty: 220, unit: 'lf', rate: 3 },
      { description: 'Ridge vent', qty: 40, unit: 'lf', rate: 9 },
      { description: 'Pipe boots and step flashing', qty: 1, unit: 'job', rate: 350 },
    ],
    note: 'Deposit of 30% due at signing. Rotten decking replaced at $85 per 4×8 sheet, shown in photos and approved on a change order. Price valid for 30 days.',
  },
  workflow: [
    {
      title: 'Squares from Quick measure',
      text: 'Tap **Measure** on a line and choose Roof: enter the plan area and the pitch (in x/12 or degrees) and you get the roof area and roofing squares. Add a waste percentage and the quantity lands on the line with its unit. Linear mode adds up eaves, rakes and ridges for drip edge and ridge vent.',
    },
    {
      title: 'Deposit at signing',
      text: 'Send the estimate with an approval link. When the homeowner signs, convert it to a deposit invoice with your Pay now link, or use progress billing to bill a percentage now and the rest at completion. Mark as paid records each payment and creates a receipt.',
    },
    {
      title: 'Before, during and after photos',
      text: 'On the job’s Photos tab, tag shots Before, During, After or Issue, mark up the soft spot with an arrow, and share chosen photos in the client portal. The **Before/after report** builds a PDF for the homeowner or their insurance adjuster.',
    },
    {
      title: 'Decking change orders in minutes',
      text: 'Create a Change Order on the job, price the sheets from your price book, attach the photos and send the approval link from the roof. Approved change orders are added to the job budget, and **Financials** shows budget against actual for the whole job.',
    },
  ],
  tips: [
    'State the decking price per sheet on the original estimate, so replacing rotten boards is an agreed price, not a negotiation with the crew waiting.',
    'Write the number of layers you expect to tear off. A surprise second layer is a change order only if the first estimate said one layer.',
    'Keep the shingle manufacturer’s warranty and your workmanship warranty in separate paragraphs, with the registration steps if the manufacturer requires them.',
    'Ask for the deposit at signing and record it on the final invoice. Check your state’s rules on deposit limits for home improvement contracts.',
  ],
  faq: [
    {
      q: 'How do I calculate roofing squares for an estimate?',
      a: 'One square is 100 square feet of roof surface. Multiply the plan (footprint) area by the pitch factor to get the roof area, divide by 100, then add waste for cuts, hips and valleys. ContractorDocs’ Quick measure does this in Roof mode from plan area and pitch, adds your waste percentage and puts the squares on the estimate line.',
    },
    {
      q: 'How should roofers handle rotten decking on an estimate?',
      a: 'Put a per-sheet price for decking replacement in the original estimate, then document what you find with photos and a change order the homeowner signs before you close the roof. See our [change order guide](/blog/change-order-form-guide).',
    },
    {
      q: 'Can homeowners sign a roofing estimate on their phone?',
      a: 'Yes. They open the approval link, read the estimate, type their name, draw a signature and tap Approve & sign; no account is needed. Signed estimates are locked, and the signature, name and time are saved on the document. Read more about [e-signatures for contractors](/blog/e-signatures-for-contractors).',
    },
    {
      q: 'Can I keep daily reports for a roofing crew?',
      a: 'Yes. The Daily Job Report records crew, hours, weather, work completed, delays and photos. It saves on your device even without signal and syncs later, and with Premium + AI the AI walkthrough can draft it from the day’s photos and what you say about them.',
    },
    {
      q: 'What does it cost?',
      a: `The Free plan is $0 with monthly limits; Premium is $${PLANS.premium.monthlyPrice} a month and Premium + AI is $${PLANS.ai.monthlyPrice} a month, or save two months with yearly billing. Free includes ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.docs} new documents per job each month. See [pricing](/pricing).`,
    },
  ],
  related: ['change-order-form-guide', 'daily-job-report-template', 'contractor-warranty-letter-template', 'how-contractors-get-paid-faster'],
};

export default page;
