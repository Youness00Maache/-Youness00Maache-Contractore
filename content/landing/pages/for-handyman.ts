import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-handyman',
  trade: 'handymen',
  eyebrow: 'For handymen',
  h1: 'A handyman invoice app built for ten small jobs a week',
  subtitle:
    'Most handyman work is small: a door that sticks, a fan to swap, a few drywall patches. The paperwork should take less time than the job. Quote from your price book, invoice before you leave and let reminders do the chasing.',
  answer:
    'Handymen get paid fastest with a price book of their common tasks, a minimum service charge, and an invoice sent from the phone before leaving the house. ContractorDocs keeps those prices ready, sends the invoice with a Pay now link to your own payment provider, follows up automatically, and gives you a request-a-quote link for new customers.',
  documents: [
    {
      name: 'Invoice',
      use: 'One invoice per visit with the minimum charge, extra labor, materials and a clear total. Send it before you pack the truck, with a Pay now link and a Scan to pay code on the PDF.',
    },
    {
      name: 'Estimate',
      use: 'Bigger jobs such as a deck repair, a fence section or a bathroom refresh, where the customer wants a price in writing and you want a signature before buying materials.',
    },
    {
      name: 'Receipt',
      use: 'Paid in cash or by check on the spot? Mark the invoice paid and a numbered receipt is created for the customer automatically.',
    },
    {
      name: 'Expense log',
      use: 'Hardware-store runs, dump fees and parking, with the receipt photo, so each cost lands on the right job and your profit per visit is real.',
    },
    {
      name: 'Note',
      use: 'The paint color in the hall closet, the filter size, the code for the side gate: details you will need next time the customer calls.',
    },
  ],
  sample: {
    type: 'Invoice',
    title: 'Saturday visit: small repairs list',
    lines: [
      { description: 'Service visit, includes first hour (minimum charge)', qty: 1, unit: 'visit', rate: 125 },
      { description: 'Additional labor', qty: 2, unit: 'hr', rate: 85 },
      { description: 'Patch, sand and paint drywall holes', qty: 2, unit: 'ea', rate: 65 },
      { description: 'Replace bathroom exhaust fan (fan supplied by customer)', qty: 1, unit: 'ea', rate: 95 },
      { description: 'Exterior door weatherstrip kit (material)', qty: 1, unit: 'kit', rate: 28 },
      { description: 'Re-caulk tub surround', qty: 1, unit: 'job', rate: 60 },
    ],
    taxRate: 7,
    note: 'Thank you! Pay online with the Pay now button or scan the code on this invoice. Payment due on receipt.',
  },
  workflow: [
    {
      title: 'A price book of everything you do',
      text: 'Save your minimum charge, hourly rate and fixed-price tasks (“mount TV, up to 65 in”, “replace faucet”, “hang interior door”) in the price book. On a document line, the tag button opens the catalog; the save button keeps a new line for next time. An invoice for a five-item visit takes a minute.',
    },
    {
      title: 'Invoice and get paid on the spot',
      text: 'Paste your own PayPal, Square, Venmo, Stripe or bank link once in Settings. Every invoice gets a Pay now button in the email and client portal and a Scan to pay code on the PDF. Paid in cash? **Mark as paid** records it and makes the receipt.',
    },
    {
      title: 'A request link for new customers',
      text: 'Your request-a-quote link and its QR code go on the van, your business cards and your Google profile. Customers send their address, what they need and up to 5 photos; the request lands in your **Inbox** and **Create client & job** turns it into work.',
    },
    {
      title: 'Reminders and repeat customers',
      text: 'Automatic reminders email unpaid invoices from your own Gmail and stop when the customer pays. For the property manager or landlord who books you every month, **Copy to another job** reuses last month’s invoice as a draft for the next visit.',
    },
  ],
  tips: [
    'Charge a minimum service fee that covers your drive time and the first hour, and print it on every estimate and invoice so it is never a surprise.',
    'Say who supplies materials. “Fan supplied by customer” on a line avoids warranty arguments if their part fails.',
    'Take a quick photo before and after each task. A two-photo record settles most “that was already broken” conversations.',
    'Check your state’s rules on the job size a handyman can take without a contractor license, and keep larger jobs on a written, signed estimate.',
  ],
  faq: [
    {
      q: 'What is the best invoice app for a handyman?',
      a: 'One that keeps your common tasks priced, makes an invoice in a minute on your phone, lets customers pay through your own payment link and follows up for you. ContractorDocs does all four on the Free plan; see how it compares with [Joist](/compare/joist-alternative) and [Invoice2go](/compare/invoice2go-alternative).',
    },
    {
      q: 'Should a handyman charge a minimum fee?',
      a: 'Most do, because driving to a ten-minute job still costs travel time and fuel. A common approach is a service visit that includes the first hour, then hourly or fixed prices per task. Put it in your price book so it is on every invoice.',
    },
    {
      q: 'Can I make an invoice without signing up?',
      a: 'Yes. The free [invoice generator](/invoice-generator) builds and previews an invoice in your browser with no account. Create it in ContractorDocs (free) to download the PDF with everything you typed, email it, save the customer and track payments.',
    },
    {
      q: 'Is the Free plan enough for a handyman?',
      a: `It depends on volume. Free includes ${FREE_LIMITS.jobs} new jobs, ${FREE_LIMITS.clients} new clients and ${FREE_LIMITS.emails} emails a month, and ${FREE_LIMITS.docs} new documents per job. If you do more visits than that, Premium is $${PLANS.premium.monthlyPrice} a month with no limits. See [pricing](/pricing).`,
    },
    {
      q: 'Can I text the invoice instead of emailing it?',
      a: 'Yes. The Text and WhatsApp buttons open your phone’s own messaging app with the message and the client’s portal link filled in, so it comes from your number and there is no SMS fee.',
    },
  ],
  related: ['how-to-write-a-construction-invoice', 'how-contractors-get-paid-faster', 'best-invoicing-software-for-contractors'],
};

export default page;
