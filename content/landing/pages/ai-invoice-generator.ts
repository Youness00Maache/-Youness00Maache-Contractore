import type { AiContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const page: AiContent = {
  kind: 'ai',
  key: 'ai-invoice-generator',
  eyebrow: 'AI invoice generator',
  h1: 'Tell it what you did today. It writes the invoice.',
  subtitle:
    'Say or type the work, the hours and the parts. The ContractorDocs assistant drafts the invoice with your price book prices, tax and deposits, and it can write the change order, the daily report or the client update from your photos too.',
  answer: `An AI invoice generator drafts an invoice from a plain description of the work you did. In ContractorDocs you type or dictate it, the assistant fills in the client, line items, your price book prices and the due date, and you check the draft before it is saved or sent. It also drafts change orders and daily reports. Every plan includes AI: ${FREE_LIMITS.ai} requests a month on Free.`,
  prompt:
    'Invoice Mrs. Patel for today: service call, replaced two kitchen GFCI outlets, 1.5 hours labor, due in 14 days.',
  sample: {
    type: 'Invoice',
    title: 'Service call, kitchen GFCI replacement',
    lines: [
      { description: 'Service call / trip charge', qty: 1, unit: 'ea', rate: 95 },
      { description: 'Labor, licensed electrician', qty: 1.5, unit: 'hr', rate: 110 },
      { description: '20 A GFCI receptacle, tamper-resistant, supply', qty: 2, unit: 'ea', rate: 32 },
      { description: 'Pigtails, wire connectors and device screws', qty: 1, unit: 'lot', rate: 12 },
    ],
    taxRate: 6,
    note: 'Example draft with example prices from a price book. Due in 14 days. Tax applies only where you set it.',
  },
  steps: [
    {
      title: 'Open the assistant on the job',
      text: 'On the job page click **AI Assistant** (or **AI Command** on the dashboard and name the client with @). Inside an open invoice, **AI fill** fills just that form.',
    },
    {
      title: 'Say what you did',
      text: 'Type or tap the microphone: the work, hours, parts, a deposit already paid, the due date. Leave out what you don’t know; it asks when something important is missing.',
    },
    {
      title: 'Check the lines and totals',
      text: 'Click **Open & edit**. Price book items carry your prices; tax, discount, deposit and balance due are calculated the same way on screen, in the PDF and in the client portal.',
    },
    {
      title: 'Add the Pay now link',
      text: 'Switch on the **Pay now** link to your own PayPal, Square, Stripe or bank link (set once in Settings), then **Save**.',
    },
    {
      title: 'Send and get paid',
      text: 'Send it from your Gmail or text the portal link. Automatic reminders follow up if it goes unpaid, and **Mark as paid** records the payment and creates a receipt.',
    },
  ],
  can: [
    {
      title: 'Invoices from a sentence or your voice',
      text: 'Describe the visit and get an itemized invoice: labor, parts, trip charges, discounts, tax, deposits and the due date. Dictation works on any phone in the browser.',
    },
    {
      title: 'Your price book prices',
      text: 'A drafted line that matches your price book gets your client price and unit. A price you say in the request wins. Lines with no match and no price stay empty for you to fill in.',
    },
    {
      title: 'Change orders before the extra work',
      text: 'Describe the added or removed work and it drafts a change order, so the client can approve and sign the price on their phone before you start it.',
    },
    {
      title: 'Daily reports and client updates from photos',
      text: `With ${PLANS.ai.name}, **AI walkthrough** turns the day’s photos and what you say about them into a Daily Job Report, and **Write client update** writes a short progress message to send by Gmail, text or WhatsApp.`,
    },
    {
      title: 'Several documents in one request',
      text: 'Ask for “a new client, a job and an invoice” and it plans each step; you review each one, or click **Do it all**.',
    },
    {
      title: 'Fills every box when you ask',
      text: 'Ask it to “fill every box” and every field of the invoice is filled: your details first, sample values for the rest. Useful for a test; replace the sample values before sending.',
    },
  ],
  limits: [
    'It does not process payments. Clients pay through your own payment link, and you record the payment with Mark as paid.',
    'It does not read your time sheets by itself. To bill logged hours and materials, use **Bill time & materials** on the job, which builds a draft invoice from unbilled time sheets and material logs without AI.',
    'It does not know your tax rules. It uses the tax rate you give it, so check the rate for your state or province.',
    'Photo updates and AI walkthroughs need Premium + AI, and every AI request needs a connection.',
    `Requests are monthly: ${FREE_LIMITS.ai} on Free, ${PAID_AI_LIMITS.premium} on ${PLANS.premium.name}, ${PAID_AI_LIMITS.ai} on ${PLANS.ai.name}.`,
  ],
  faq: [
    {
      q: 'Is there a free AI invoice generator for contractors?',
      a: `Yes. The ContractorDocs Free plan includes ${FREE_LIMITS.ai} AI requests a month, every document type and ${FREE_LIMITS.emails} Gmail emails a month, with no credit card. If you only need a blank form, the [free invoice generator](/invoice-generator) works without an account.`,
    },
    {
      q: 'What can the AI draft besides invoices?',
      a: 'Estimates (with good/better/best options), change orders, daily job reports, work orders, time sheets, notes and the other document types, plus new clients, jobs and batch emails. Everything is a draft until you save or send it.',
    },
    {
      q: 'Does the AI add tax and deposits correctly?',
      a: 'It fills in the tax rate and any deposit you mention, and the invoice does the math: subtotal, discount, tax, amount paid and balance due are calculated by the form, the PDF and the portal in the same way. Check the tax rate for your area.',
    },
    {
      q: 'Can it write a daily report from my photos?',
      a: `Yes, on ${PLANS.ai.name}. On the job’s Photos tab, AI walkthrough takes the day’s photos and what you say about them and drafts a Daily Job Report or a Note. It only writes what the photos and your note show: weather, crew size and hours appear only when you say them.`,
    },
    {
      q: 'How many AI requests do I get?',
      a: `${FREE_LIMITS.ai} a month on Free, ${PAID_AI_LIMITS.premium} on ${PLANS.premium.name} ($${PLANS.premium.monthlyPrice} a month) and ${PAID_AI_LIMITS.ai} on ${PLANS.ai.name} ($${PLANS.ai.monthlyPrice} a month). One photo update or walkthrough with up to 8 photos is one request. See [pricing](/pricing).`,
    },
  ],
  related: ['change-orders-with-ai', 'how-to-write-a-construction-invoice', 'how-contractors-get-paid-faster', 'daily-job-report-template'],
};

export default page;
