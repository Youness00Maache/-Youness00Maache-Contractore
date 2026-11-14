import type { AiContent } from '../types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../../../lib/plans.ts';

const page: AiContent = {
  kind: 'ai',
  key: 'ai-estimate-generator',
  eyebrow: 'AI estimate generator',
  h1: 'Say what the job is. Get an estimate you can check and send.',
  subtitle:
    'Type or dictate the job in a sentence or two. The ContractorDocs assistant drafts the estimate with line items, your price book prices and, if you ask, good/better/best options. You review every line before anything is saved or sent.',
  answer: `An AI estimate generator turns a plain description of a job into a draft estimate with line items. In ContractorDocs you type or dictate the job, the assistant drafts the estimate (or three good/better/best options), lines that match your price book get your prices, and nothing is saved or sent until you check it. Every plan includes AI: ${FREE_LIMITS.ai} requests a month on Free.`,
  prompt:
    'Estimate for the Carters at 18 Oak Lane: replace the 50 gallon gas water heater, add an expansion tank and a new gas shut-off, haul away the old one. Permit included.',
  sample: {
    type: 'Estimate',
    title: 'Water heater replacement, 18 Oak Lane',
    lines: [
      { description: 'Remove and haul away existing water heater', qty: 1, unit: 'job', rate: 225 },
      { description: '50-gal gas water heater, supply', qty: 1, unit: 'ea', rate: 1350 },
      { description: 'Install water heater: gas, water and vent connections, leak test', qty: 1, unit: 'job', rate: 650 },
      { description: 'Thermal expansion tank, supply & install', qty: 1, unit: 'ea', rate: 185 },
      { description: 'Gas shut-off valve and flex connector', qty: 1, unit: 'ea', rate: 95 },
      { description: 'Permit', qty: 1, unit: 'ea', rate: 85 },
    ],
    note: 'Example draft with example prices from a price book. A line that matches nothing in your price book is left without a price for you to fill in.',
  },
  steps: [
    {
      title: 'Open the assistant',
      text: 'Click **AI Command** on the dashboard (on a phone, the sparkle button), or **AI Assistant** on a job page so the estimate lands on that job.',
    },
    {
      title: 'Describe the job',
      text: 'Type or tap the microphone and say it the way you would tell your office: the client, the address, the work and anything special. Type @ to pick an existing client. You can attach up to 3 photos.',
    },
    {
      title: 'Ask for options if you want them',
      text: 'Add “good / better / best” and the assistant drafts three options, each with its own lines and total. The second one is marked Recommended until you change it.',
    },
    {
      title: 'Check the draft',
      text: 'Click **Open & edit**. Lines that match your price book already carry your price, unit and kit parts. Fill in any price left empty, change quantities, add your terms.',
    },
    {
      title: 'Save and send',
      text: 'Click **Save**, then **Share** to send it from your Gmail or copy the approval link. The client picks an option and signs on their phone, and an accepted estimate becomes an invoice with **Convert to invoice**.',
    },
  ],
  can: [
    {
      title: 'Drafts from a sentence or your voice',
      text: 'One description becomes a complete estimate: scope lines, quantities, units, notes and the valid-until date. Dictation works from the job site, so you can quote before you leave the driveway.',
    },
    {
      title: 'Good / better / best in one request',
      text: 'Ask for options and you get three priced versions on one estimate. The client compares them in the approval link and signs the one they want; **Apply chosen option** turns the estimate into that option.',
    },
    {
      title: 'Uses your price book, not made-up prices',
      text: 'A line that is one of your price book items gets your client price, unit and kit parts, as if you had picked it yourself. Only names, units, client prices, short descriptions and kit parts are sent to the AI, never your costs or margins.',
    },
    {
      title: 'Knows your clients and jobs',
      text: 'It fills in the client’s name, email and address from your records, can add a new client or job in the same request, and puts the estimate on the right job.',
    },
    {
      title: 'Change orders from the same conversation',
      text: 'When the scope changes mid-job, describe the change and it drafts a change order with the added or removed work, ready for the client’s signature. The current contract value comes from the accepted estimate.',
    },
    {
      title: 'Fills every box when you ask',
      text: 'Ask it to “fill every box” and it completes every field of the estimate: what you told it first, then sample values for the rest. Handy for a test or a starting template; replace the sample values before you send.',
    },
  ],
  limits: [
    'It does not know your local material or labor prices. Prices come only from your price book or from what you type; other lines stay empty for you to price (unless you ask it to fill every box with sample values).',
    'It does not measure anything. Give it the quantities, or use the built-in quick-measure calculator for rooms, roofs, lengths and slabs.',
    'It drafts, you decide. Nothing is saved, sent or signed until you click, so a wrong quantity is caught before the client sees it.',
    'It needs a connection. Estimates can be drafted by hand offline, but the AI assistant works only when you are online.',
    `Requests are monthly: ${FREE_LIMITS.ai} on Free, ${PAID_AI_LIMITS.premium} on ${PLANS.premium.name} and ${PAID_AI_LIMITS.ai} on ${PLANS.ai.name}. The allowance resets each calendar month.`,
  ],
  faq: [
    {
      q: 'Is the AI estimate generator free?',
      a: `Yes, within the Free plan’s allowance of ${FREE_LIMITS.ai} AI requests a month, with no credit card. ${PLANS.premium.name} ($${PLANS.premium.monthlyPrice} a month) includes ${PAID_AI_LIMITS.premium} requests and ${PLANS.ai.name} ($${PLANS.ai.monthlyPrice} a month) includes ${PAID_AI_LIMITS.ai}. See [pricing](/pricing).`,
    },
    {
      q: 'Where do the prices on an AI-drafted estimate come from?',
      a: 'From your price book. When a drafted line matches one of your items, it gets your client price, unit and kit parts; a price you type in the request always wins. The assistant does not invent prices for other lines, so you fill those in before sending.',
    },
    {
      q: 'Can the AI write good, better and best options?',
      a: 'Yes. Ask for “good / better / best” and it drafts three options on one estimate, each with its own lines and total. Your client chooses and signs in the approval link. Options themselves are available on every plan, with or without AI.',
    },
    {
      q: 'Can I dictate an estimate instead of typing?',
      a: 'Yes. Tap the microphone in the assistant and speak; your words become the request. It works in the browser on phones, tablets and computers.',
    },
    {
      q: 'Does the AI send the estimate to my client?',
      a: 'No. It only drafts. You open the draft, check it and click Save; sending is a separate step from the Share window, from your own Gmail or by approval link.',
    },
    {
      q: 'Which AI model does ContractorDocs use?',
      a: 'Google Gemini. Your request and the parts of your price book that match it are sent to Gemini to draft the estimate; your costs and margins are not. The [privacy policy](/privacy) explains how AI requests are handled.',
    },
  ],
  related: ['how-to-create-a-construction-estimate-with-ai', 'good-better-best-pricing-for-contractors', 'send-estimate-clients-can-sign-on-phone', 'best-ai-tools-for-contractors'],
};

export default page;
