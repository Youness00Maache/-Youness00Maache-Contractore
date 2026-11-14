import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-plumbers',
  trade: 'plumbers',
  eyebrow: 'For plumbers',
  h1: 'Plumbing estimates and invoices you can send from the driveway',
  subtitle:
    'Quote the water heater with three options before you leave the basement, invoice the after-hours leak with the photos attached, and stop chasing payments by hand.',
  answer:
    'For a plumbing business, the fastest way to quote and bill is to send a good/better/best estimate from your phone while you are still on site, let the customer pick and sign on their own phone, and invoice the moment the job is done. ContractorDocs does that on the Free plan, with a Pay now link to your own payment provider and automatic reminders sent from your Gmail.',
  documents: [
    {
      name: 'Estimate with options',
      use: 'Water heater replacements, fixture upgrades and repipes. Put a standard tank, a larger or longer-warranty tank and a tankless unit side by side, so the customer chooses instead of asking you to “come back with a cheaper number”.',
    },
    {
      name: 'Invoice',
      use: 'Service calls and emergency work: the trip or after-hours charge, diagnosis time, parts and labor on separate lines, with photos of the leak or the failed part in the job.',
    },
    {
      name: 'Work order',
      use: 'Send a tech with the address, access notes (“key under the mat, dog in the yard”), the fixture or line at fault and the shut-off location, and get the customer’s sign-off on completion.',
    },
    {
      name: 'Change order',
      use: 'The corroded shut-off that breaks when you turn it, or the code-required expansion tank the customer didn’t expect. Get it approved before the extra work.',
    },
    {
      name: 'Receipt',
      use: 'A numbered receipt for every payment, created automatically when you mark an invoice paid, with the remaining balance if it was a part payment.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: '50-gallon gas water heater replacement (Better option)',
    lines: [
      { description: 'Drain, disconnect and haul away existing water heater', qty: 1, unit: 'job', rate: 225 },
      { description: '50-gal gas water heater, 9-year tank warranty, supply', qty: 1, unit: 'ea', rate: 1350 },
      { description: 'Install: gas, water and vent connections, leak test', qty: 1, unit: 'job', rate: 650 },
      { description: 'Thermal expansion tank, supply & install', qty: 1, unit: 'ea', rate: 185 },
      { description: 'New gas shut-off valve and flex connector', qty: 1, unit: 'ea', rate: 95 },
      { description: 'Drip pan and strapping (as required locally)', qty: 1, unit: 'ea', rate: 120 },
      { description: 'Permit', qty: 1, unit: 'ea', rate: 85 },
    ],
    note: 'Good (40-gal, 6-year) and Best (tankless) options are on the first page. Permit billed at cost. Price valid for 14 days.',
  },
  workflow: [
    {
      title: 'Good / better / best on every replacement',
      text: 'Click **Good / better / best** in an estimate and the current lines become three options you can rename and change. The customer taps the option they want in the approval link and signs. **Apply chosen option** turns the estimate into that option with one total, ready to convert to an invoice. Options are available on every plan.',
    },
    {
      title: 'Photos that explain the price',
      text: 'On the job’s **Photos** tab, tag shots Before, During, After or Issue: the rusted tank bottom, the pinhole leak, the finished install. Choose which ones show in the client portal. The **Before/after report** makes a PDF of them when an insurance adjuster or a landlord asks for proof.',
    },
    {
      title: 'Bill the call before the next one',
      text: 'Your price book holds the trip charge, after-hours rate and common parts, so a service-call invoice is a few taps. Add the Pay now link (your own PayPal, Square, Stripe or bank link) and send it from Gmail, or text the portal link with the **Text** or **WhatsApp** button, which opens your phone’s own messaging app.',
    },
    {
      title: 'Reminders and a quote-request link',
      text: 'Automatic reminders email unpaid invoices on the due date and 7 and 14 days later, and stop when the customer pays or taps **I’ve paid**. Your request-a-quote link and printable QR sign let new customers send the address, a description and up to 5 photos, which land on your dashboard ready to become a client and a job.',
    },
  ],
  tips: [
    'Show emergency, weekend and after-hours rates on the estimate or work order before you start, not first on the invoice.',
    'Write the model and serial number of the new water heater or fixture on the invoice. It makes warranty claims and the next service visit easy.',
    'When you find a code issue (no expansion tank, wrong venting), photograph it and price it as a separate line or a change order so the customer can see it was required, not an upsell. Rules vary by city, so name the requirement only if you are sure of it.',
    'Collect a deposit on special-order fixtures before you order them, and record it on the invoice so the balance due is right.',
  ],
  faq: [
    {
      q: 'How do plumbers give customers options without three separate quotes?',
      a: 'Use one estimate with good/better/best options. In ContractorDocs each option has its own lines and total, the PDF marks the Recommended one, and the customer picks and signs in the approval link. The chosen option becomes the estimate’s single total when you click Apply chosen option.',
    },
    {
      q: 'Can customers pay a plumbing invoice by card?',
      a: 'Yes, through your own payment provider. Paste your PayPal, Square, Stripe or bank payment link once in Settings and switch on the Pay now link on an invoice: the customer gets a Pay now button in the portal and email, and a Scan to pay code on the PDF. ContractorDocs does not process cards itself; you record the payment with Mark as paid.',
    },
    {
      q: 'Can I invoice right after the job, from my phone?',
      a: 'Yes. ContractorDocs runs in the browser on any phone, tablet or computer and can be added to your home screen. If the signal drops in a crawl space, field documents still save on your device and sync when you are back online; new invoices can be drafted and get their final number when they sync.',
    },
    {
      q: 'What should a plumbing invoice include?',
      a: 'Your business and license details, the service address, the date of service, a description of the problem and the fix, parts and labor on separate lines, any trip or after-hours charge, tax where it applies, payment terms and how to pay. The [construction invoice guide](/blog/how-to-write-a-construction-invoice) walks through each line.',
    },
    {
      q: 'How much does ContractorDocs cost for a small plumbing shop?',
      a: `The Free plan includes every document type with ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.emails} emails a month. Premium is $${PLANS.premium.monthlyPrice} a month for unlimited jobs, clients, documents and Gmail sending; Premium + AI is $${PLANS.ai.monthlyPrice} a month. See [pricing](/pricing).`,
    },
  ],
  related: ['how-to-write-a-construction-invoice', 'how-contractors-get-paid-faster', 'work-order-template', 'change-order-form-guide'],
};

export default page;
