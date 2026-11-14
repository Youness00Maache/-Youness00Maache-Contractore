import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-electricians',
  trade: 'electricians',
  eyebrow: 'For electricians',
  h1: 'Estimates, change orders and invoices for electrical contractors',
  subtitle:
    'Price a panel upgrade, a service call or a rough-in from your phone, get the homeowner’s signature before you pull the permit, and bill the extra circuit you found behind the drywall without an argument.',
  answer:
    'The simplest way for an electrician to make estimates and invoices is to keep your common work (panel swaps, circuits, devices, service calls) in a price book, build each estimate from it, and send an approval link the customer signs on their phone. ContractorDocs does that on the Free plan, adds change orders and work orders on the same job, and turns the signed estimate into an invoice in one click.',
  documents: [
    {
      name: 'Estimate',
      use: 'Panel upgrades, EV charger circuits, remodel wiring and lighting packages. Note the existing service size, the new amperage, who coordinates the utility disconnect and that the permit fee is billed at cost.',
    },
    {
      name: 'Work order',
      use: 'Service calls and small jobs for your crew: address, panel location, the circuit or device at fault, what to check first and the customer’s sign-off when the work is done.',
    },
    {
      name: 'Change order',
      use: 'The extra circuit, the aluminum branch wiring or the undersized feeder you only see once the walls are open. Price it and get it signed before you run the wire, not after.',
    },
    {
      name: 'Invoice',
      use: 'Bill the job with materials and labor on separate lines, deposits already paid taken off, and a Pay now link to your own PayPal, Square or Stripe page.',
    },
    {
      name: 'Material log and purchase order',
      use: 'Record wire, breakers and devices used per job so the job’s real cost is known, and order gear from your supplier with quantities tied to the job.',
    },
    {
      name: 'Warranty',
      use: 'A workmanship warranty at closeout that separates your labor from the manufacturer’s warranty on breakers, panels and fixtures.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: 'Panel upgrade, 100 A to 200 A',
    lines: [
      { description: 'Remove existing 100 A panel and meter base', qty: 1, unit: 'job', rate: 650 },
      { description: '200 A main breaker panel, 40 spaces, supply & install', qty: 1, unit: 'ea', rate: 1450 },
      { description: '200 A meter base and service entrance cable', qty: 1, unit: 'ea', rate: 980 },
      { description: 'Grounding electrode system and bonding', qty: 1, unit: 'job', rate: 420 },
      { description: 'Transfer, test and label existing circuits', qty: 24, unit: 'circuit', rate: 25 },
      { description: 'AFCI / GFCI breakers where required by code', qty: 8, unit: 'ea', rate: 55 },
      { description: 'Permit application and inspection visit', qty: 1, unit: 'job', rate: 250 },
    ],
    note: 'Utility disconnect and reconnect scheduled with the power company. Permit fee billed at cost. Price valid for 30 days.',
  },
  workflow: [
    {
      title: 'Price book and kits for repeat work',
      text: 'Save “200 A panel swap”, “EV charger circuit, 50 A” or “Recessed light, per can” once in the **Price book** with your cost and markup. A kit bundles the breaker, wire, box and labor, so a line on an estimate carries every part and its price. Picking a line from Inventory takes the parts off your stock when the customer approves.',
    },
    {
      title: 'Signed before you pull the permit',
      text: 'Send the estimate with an approval link. The homeowner reads it, types their name, draws a signature and taps Approve & sign on their phone. Signed estimates lock, so the number you pulled the permit on is the number on file. Need options? Good / better / best lets you quote a panel swap with and without a whole-home surge protector or a generator inlet.',
    },
    {
      title: 'Change orders when the walls open up',
      text: 'Found knob-and-tube or a shared neutral? Create a Change Order on the same job, take a photo, price it from your price book and send the approval link before you do the extra work. Approved change orders are added to the job budget, so Financials shows the real contract value.',
    },
    {
      title: 'From signed estimate to paid invoice',
      text: 'An accepted estimate becomes an invoice with **Convert to invoice**. Turn on the Pay now link, send it from your Gmail, and let automatic reminders follow up at the due date and 7 and 14 days later. When the money arrives, **Mark as paid** records it and creates the receipt.',
    },
  ],
  tips: [
    'Write the service size, panel make and the new amperage on the estimate. It ends the “I thought that was included” conversation and helps the inspector.',
    'Keep permit and inspection fees on their own line, billed at cost, and say who schedules the utility disconnect. Check your state’s and city’s rules on who may pull the permit.',
    'Put trouble-shooting time on service calls as a minimum charge plus an hourly line, so the customer sees why a five-minute fix still costs the first hour.',
    'Photograph the panel before you open it and after the cover is back on. Photos on the job protect you if something unrelated fails a month later.',
    'Separate your workmanship warranty from the manufacturer’s warranty on breakers, fixtures and chargers in the closeout letter.',
  ],
  faq: [
    {
      q: 'What should an electrician’s estimate include?',
      a: 'Your license number and business details, the scope written as work items (remove panel, install 200 A panel, transfer circuits), materials and labor, permit and inspection lines, exclusions such as drywall repair or utility fees, a validity date and a place to sign. ContractorDocs puts your logo, license number and terms on every document. See the [construction estimate guide](/blog/construction-estimate-template) for the full method.',
    },
    {
      q: 'Can I charge for an extra circuit found during rough-in?',
      a: 'Yes, if it is outside the signed scope, and the clean way is a written change order the customer approves before you do the work. In ContractorDocs you create a Change Order on the same job, price it and send an approval link; the signature, name and time are saved on the document. Read [how to write a change order](/blog/change-order-form-guide).',
    },
    {
      q: 'Can I track wire, breakers and devices per job?',
      a: 'Yes. Inventory keeps stock levels with QR labels for your shelves or van, and lines picked from inventory on an estimate or invoice take stock off when the document is approved or paid. Material logs record what was used on each job, and job Financials subtracts them from the job’s income.',
    },
    {
      q: 'Is ContractorDocs free for a one-person electrical business?',
      a: `Yes, the Free plan covers all 12 document types with ${FREE_LIMITS.jobs} new jobs, ${FREE_LIMITS.clients} new clients and ${FREE_LIMITS.emails} emails a month. Premium removes the limits for $${PLANS.premium.monthlyPrice} a month and Premium + AI is $${PLANS.ai.monthlyPrice} a month. See [pricing](/pricing).`,
    },
    {
      q: 'Can the AI write my estimate?',
      a: 'Describe the job, for example “200 amp panel upgrade, move 24 circuits, new meter base, permit”, and the assistant drafts the estimate with lines from your price book at your prices. You review and edit everything before it is saved or sent. See the [AI estimate generator](/ai-estimate-generator).',
    },
  ],
  related: ['change-order-form-guide', 'construction-estimate-template', 'work-order-template', 'material-log-job-costing'],
};

export default page;
