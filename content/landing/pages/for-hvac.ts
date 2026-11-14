import type { TradeContent } from '../types.ts';
import { PLANS, FREE_LIMITS } from '../../../lib/plans.ts';

const page: TradeContent = {
  kind: 'trade',
  key: 'for-hvac',
  trade: 'HVAC contractors',
  eyebrow: 'For HVAC contractors',
  h1: 'HVAC estimates with system options, and invoices for every tune-up',
  subtitle:
    'Lay out a repair, a standard replacement and a high-efficiency system on one estimate, let the homeowner choose and sign on their phone, and keep maintenance billing on a schedule.',
  answer:
    'HVAC contractors close more replacements when the homeowner sees clear options with prices side by side and can sign on the spot. ContractorDocs builds good/better/best estimates from your price book, adds your financing partner’s link to larger estimates, records equipment model and serial numbers on the invoice and repeats maintenance invoices on a schedule, starting on the Free plan.',
  documents: [
    {
      name: 'Estimate with system options',
      use: 'Repair the existing unit, replace with a standard system, or upgrade to a higher-efficiency heat pump. Each option lists its equipment, labor, line set and permit, with its own total.',
    },
    {
      name: 'Invoice',
      use: 'Installs and service calls with the equipment brand, model and serial numbers, the refrigerant added, and a clear split between diagnostic fee, parts and labor.',
    },
    {
      name: 'Work order',
      use: 'Maintenance visits and installs: unit location, filter size, access notes and the checklist for the tech, signed off by the customer when the visit is done.',
    },
    {
      name: 'Repeating invoice',
      use: 'Maintenance agreements billed every month, quarter or year with **Repeat this invoice**, so the agreement is invoiced even on a busy week.',
    },
    {
      name: 'Warranty',
      use: 'A closeout letter that separates your labor warranty from the manufacturer’s parts and compressor warranty, with the registration date.',
    },
  ],
  sample: {
    type: 'Estimate',
    title: '3-ton heat pump system replacement (Better option)',
    lines: [
      { description: 'Remove and recycle existing condenser and coil', qty: 1, unit: 'job', rate: 450 },
      { description: '3-ton heat pump condenser, supply & set on new pad', qty: 1, unit: 'ea', rate: 4200 },
      { description: 'Matching air handler with evaporator coil', qty: 1, unit: 'ea', rate: 2100 },
      { description: 'Line set flush, pressure test and refrigerant charge', qty: 1, unit: 'job', rate: 650 },
      { description: 'Programmable thermostat, supply & install', qty: 1, unit: 'ea', rate: 220 },
      { description: 'Condensate pump and drain line', qty: 1, unit: 'ea', rate: 240 },
      { description: 'Permit, startup and performance check', qty: 1, unit: 'job', rate: 300 },
    ],
    note: 'Good (repair), Better and Best (variable-speed) options are on the first page. Equipment registered for the manufacturer’s warranty at install. Financing available, apply through the link on this estimate.',
  },
  workflow: [
    {
      title: 'Options the homeowner can compare',
      text: 'Turn on **Good / better / best** in an estimate, fill each option from price-book kits (condenser, coil, line set, labor) and mark the one you recommend. The homeowner opens the approval link, swipes through the options, taps one and signs. The AI assistant can draft the three options from a one-line description, using your price book prices.',
    },
    {
      title: 'Financing link on big tickets',
      text: 'Paste your financing partner’s application link once in Settings, Payments & reviews. It shows on larger estimates, so a homeowner facing a full replacement can apply on the lender’s own page. ContractorDocs does not lend money or show loan terms.',
    },
    {
      title: 'Maintenance agreements that bill themselves',
      text: 'Set a maintenance invoice to repeat on a schedule, put the visit on the calendar, and turn on visit reminders so the customer gets an email the day before. Automatic reminders also chase unpaid invoices from your own Gmail and stop as soon as the invoice is paid.',
    },
    {
      title: 'Know which installs make money',
      text: 'Job **Financials** compares the budget (accepted estimate plus approved change orders) with what the job has cost: equipment on purchase orders, material logs, expenses and time-sheet hours at your labor rate. **Insights** shows revenue, profit and your estimate win rate for any period.',
    },
  ],
  tips: [
    'Put the equipment model and serial number on the invoice and the warranty letter. Warranty claims and the next service call go faster.',
    'Quote a repair option alongside replacements when it is a real option. Customers trust a quote that doesn’t only offer the most expensive fix.',
    'Write load-calculation, ductwork and electrical exclusions in plain words on replacement estimates, so a needed duct or breaker change is a change order, not a dispute.',
    'Bill maintenance agreements on a repeating invoice and record each visit on a work order, so you can show the customer exactly what was done when the agreement renews.',
  ],
  faq: [
    {
      q: 'How do I present good, better and best HVAC options?',
      a: 'Put all three on one estimate with their own equipment, labor and totals, mark the recommended one and let the customer choose. ContractorDocs prints every option on the PDF and lets the customer pick one and sign in the approval link or client portal. Our guide to [estimating](/blog/construction-estimate-template) covers how to price each option.',
    },
    {
      q: 'Can I bill maintenance agreements automatically?',
      a: 'You can set an invoice to repeat on a schedule (Repeat this invoice), and automatic reminders follow up if it is not paid. Payments come in through your own payment link and are recorded with Mark as paid, which also creates the receipt.',
    },
    {
      q: 'Can I offer financing on a system replacement?',
      a: 'Yes, by linking your own financing partner. Paste their application link in Settings and it appears on larger estimates; the homeowner applies on the lender’s page. ContractorDocs does not provide loans itself.',
    },
    {
      q: 'Does it work for a one-truck HVAC business?',
      a: `Yes. The Free plan includes all 12 document types, e-signatures and the client portal with ${FREE_LIMITS.jobs} new jobs a month. Premium is $${PLANS.premium.monthlyPrice} a month without limits, and Premium + AI ($${PLANS.ai.monthlyPrice} a month) adds a larger AI allowance and photo client updates. See [pricing](/pricing).`,
    },
    {
      q: 'Can the AI write an HVAC estimate from my notes?',
      a: 'Yes. Type or dictate something like “replace 3 ton heat pump and air handler, new thermostat, good better best” and the assistant drafts the estimate with options and your price book prices. Nothing is saved or sent until you review it. See the [AI estimate generator](/ai-estimate-generator).',
    },
  ],
  related: ['construction-estimate-template', 'how-contractors-get-paid-faster', 'contractor-warranty-letter-template', 'e-signatures-for-contractors'],
};

export default page;
