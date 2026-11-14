import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-painters',
  trade: 'painters',
  eyebrow: 'For painting contractors',
  h1: 'Painting estimates measured to the square foot',
  subtitle:
    'Measure the rooms, price walls, ceilings, trim and doors separately, offer two or three paint grades, and get the colors signed off before the first coat goes on.',
  answer:
    'Painting contractors price accurately when they measure wall and ceiling area with doors and windows taken off, price surfaces separately with the number of coats, and let the customer choose between paint grades. ContractorDocs measures rooms on your phone, builds good/better/best estimates from your price book and gets estimates and color changes signed online.',
  documents: [
    {
      name: 'Estimate with paint options',
      use: 'Interior and exterior repaints priced by surface: walls, ceilings, trim, doors and cabinets, each with coats and prep. Offer a standard, a mid-grade and a premium paint as good/better/best options.',
    },
    {
      name: 'Change order',
      use: 'Color changes after the first coat, an extra room, or wallpaper removal nobody knew about. Price it and get it signed before the crew moves on.',
    },
    {
      name: 'Work order',
      use: 'The crew’s sheet: rooms, colors and sheen per surface, product, prep notes (“caulk all baseboard gaps”) and what to protect.',
    },
    {
      name: 'Invoice',
      use: 'Deposit at booking and balance at the final walkthrough, with touch-ups noted and the deposit already deducted.',
    },
    {
      name: 'Material log',
      use: 'Gallons, primer, caulk and tape used per job, so you know what the job really cost and how close your paint estimate was.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: 'Interior repaint: three bedrooms and hallway',
    lines: [
      { description: 'Walls, 2 coats, mid-grade washable eggshell', qty: 1450, unit: 'sq ft', rate: 1.6 },
      { description: 'Ceilings, 1 coat flat white', qty: 520, unit: 'sq ft', rate: 1.1 },
      { description: 'Baseboards and window trim, 2 coats semi-gloss', qty: 310, unit: 'lf', rate: 1.75 },
      { description: 'Interior doors and frames, both sides', qty: 7, unit: 'ea', rate: 85 },
      { description: 'Patch, sand and spot-prime walls', qty: 1, unit: 'job', rate: 300 },
      { description: 'Move furniture, cover floors, daily cleanup', qty: 1, unit: 'job', rate: 180 },
    ],
    note: 'Wall area measured room by room with doors and windows deducted. Colors confirmed on a signed color sheet before work starts. Good (contractor grade) and Best (premium scrubbable) options are on the first page.',
  },
  workflow: [
    {
      title: 'Measure rooms in the room',
      text: 'Tap **Measure** next to a line and choose Room: enter length, width and height, and doors and windows come off the walls (a door is 3′ × 6′8″ and a window 3′ × 4′ until you change the size). Pick floor, walls or ceiling and **Use this quantity**. Linear mode adds up trim, and Waste % covers cut-in and touch-ups.',
    },
    {
      title: 'Paint grades as good / better / best',
      text: 'Copy the same lines into three options and change only the product and rate. The customer sees the difference in one estimate, taps the grade they want in the approval link and signs. You apply the chosen option and convert it to an invoice when the job is done.',
    },
    {
      title: 'Color sign-off on paper',
      text: 'List each room’s colors and sheens on a no-cost change order, add a photo of the swatches and send the approval link. When someone changes their mind after the first coat, the signed sheet shows what was agreed, and a new change order prices the repaint.',
    },
    {
      title: 'Track paint against the estimate',
      text: 'Log gallons and sundries on a material log and crew hours on time sheets. **Financials** compares them with the budget from the accepted estimate, so you learn whether your square-foot rates hold up across jobs.',
    },
  ],
  tips: [
    'Price walls, ceilings, trim and doors as separate lines. A customer who drops the ceilings from the scope can see the exact difference.',
    'Write the number of coats and the paint product on each line; “2 coats” on paper stops “I thought it would be one coat” and the reverse.',
    'Get colors and sheens approved in writing before you open the cans. A signed color sheet makes a color change a paid change order.',
    'Note who moves furniture and what condition the walls are in before you start, with a few photos.',
  ],
  faq: [
    {
      q: 'How do painters calculate square footage for an estimate?',
      a: 'For walls, add up the perimeter of the room and multiply by the wall height, then subtract doors and windows. Ceilings are length × width. ContractorDocs’ Quick measure does this in Room mode, takes standard door and window sizes off the walls and puts the result on the estimate line with its unit.',
    },
    {
      q: 'Should painters charge per square foot or per room?',
      a: 'Square-foot pricing per surface is easier to defend and to compare between jobs; per-room pricing is quicker for simple repaints. Many painters keep both in their price book. Our [estimating guide](/blog/construction-estimate-template) shows how to build the rate from labor, materials, overhead and profit.',
    },
    {
      q: 'How do I offer different paint grades?',
      a: 'Use good/better/best options on one estimate: the same surfaces, a different product and rate in each option. The customer chooses and signs one in the approval link. Options are available on every plan.',
    },
    {
      q: 'Can I take a deposit before the job?',
      a: 'Yes. Send a deposit invoice with your own payment link when the estimate is signed, then invoice the balance at completion with the deposit already deducted. Mark as paid records each payment and creates a receipt.',
    },
    {
      q: 'What does ContractorDocs cost for a painting business?',
      a: `The Free plan is $0 and includes ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.emails} emails a month; Premium is $${PLANS.premium.monthlyPrice} a month without limits, and Premium + AI is $${PLANS.ai.monthlyPrice} a month. See [pricing](/pricing).`,
    },
  ],
  related: ['construction-estimate-template', 'change-order-form-guide', 'material-log-job-costing'],
};

export default page;
