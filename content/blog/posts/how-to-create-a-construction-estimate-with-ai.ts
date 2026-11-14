import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-create-a-construction-estimate-with-ai',
  answer:
    'To create a construction estimate with AI, describe the job in one message (scope, sizes, materials and what is excluded), let the assistant draft the line items, then check every quantity and price against your own numbers before you send it. AI is fast at structure and wording; your price book, your measurements and your margin are what make the number right.',
  takeaways: [
    'Give the AI the facts it can’t guess: sizes, materials, finish level, what’s included and what isn’t.',
    'Prices should come from your own price book, not from a general chatbot’s idea of what a deck costs.',
    'Review every line, fill the quantities from real measurements and check your margin before the client sees a number.',
    'A good AI draft takes a minute; the review takes five. Both together still beat typing an estimate from scratch.',
  ],
  howTo: {
    name: 'How to create a construction estimate with AI',
    totalTime: 'PT15M',
    steps: [
      { name: 'Put your prices in a price book', text: 'Save your common services, labor, materials and kits with their client prices so the assistant can use your real numbers.' },
      { name: 'Describe the job in one message', text: 'Type or dictate the scope, sizes, materials, finish level, exclusions and the client’s name. Attach site photos if they help.' },
      { name: 'Review the draft line by line', text: 'Check that every task is there, descriptions are specific, nothing is invented and lines without a price are flagged for you to fill.' },
      { name: 'Fill quantities from real measurements', text: 'Use your takeoff or a measuring tool for areas, lengths and volumes, and add a waste allowance where materials are cut.' },
      { name: 'Check the margin and add terms', text: 'Compare price with cost per line, then add exclusions, allowances, a deposit and a valid-until date.' },
      { name: 'Send it for an e-signature', text: 'Send an approval link so the client can read the estimate and sign it on their phone.' },
    ],
  },
  body: `You can create a construction estimate with AI in a few minutes: describe the job in one message, let the assistant turn it into line items and wording, then check the quantities and prices yourself before anything goes to the client. The AI does the typing and the structure. You stay responsible for the number.

That split matters. An AI assistant can turn "replace 240 sq ft of deck boards with composite and add 36 feet of aluminum railing" into a tidy estimate in under a minute. What it can't know is your labor rate, what your supplier charges for composite this month, or the soft joist you noticed on the walkthrough. Contractors who get real value from AI estimating treat it like a fast apprentice: it drafts, you price and check.

This guide walks through the process step by step, with a worked example, the mistakes to avoid, and how it works inside ContractorDocs.

## What AI does well in estimating, and what it doesn't

Before you start, be clear about which parts of an estimate an AI can actually help with.

| Estimating task | Can AI help? | Why |
| --- | --- | --- |
| Turning rough notes into line items | Yes | It's good at structure and consistent wording |
| Writing clear scope descriptions | Yes | Specific sentences are its strength |
| Spotting forgotten items (haul-away, cleanup, permits) | Often | Treat its suggestions as a checklist, not a price |
| Quantities | Only from what you give it | It can't measure the job |
| Unit prices | Only from your own price list | A general chatbot guesses from old, national data |
| Markup and margin | No | That's a business decision |
| Exclusions and allowances | Drafts the wording | You decide what's in and out |

The rule of thumb: let AI handle words and structure, and keep numbers tied to sources you trust.

## Step 1: Put your prices where the AI can use them

The biggest risk with AI estimates is a confident price with nothing behind it. The fix is to give the assistant your prices instead of letting it invent them.

Start a price book with the 20 to 40 items you quote most often: your labor rates by task, common materials with your client price, and bundles you sell as one line (a "toilet install" kit with the wax ring, supply line and labor). If you've never built one, our [construction estimate template guide](/blog/construction-estimate-template) walks through how to price labor at a burdened rate and add overhead.

In ContractorDocs, the [AI assistant](/features#ai-assistant) uses your price book when it drafts an estimate, invoice or change order. A line that matches one of your items gets your price, unit and kit parts, as if you'd picked it yourself, and a price you type in your request still wins. It never makes up prices for other lines: those stay empty and are flagged so you fill them in. Only item names, units, client prices, short descriptions and kit parts are sent to the AI, never your costs or margins.

## Step 2: Describe the job in one message

A good request reads like the note you'd leave for an estimator. Include:

- **The work:** what you're removing, building, installing and cleaning up
- **Sizes and counts:** square feet, linear feet, number of fixtures or openings
- **Materials and finish level:** brand or grade if it matters to the price
- **What's excluded:** permits, painting, electrical, anything the client might assume
- **Who it's for:** the client's name, so the estimate lands on the right job

> Example request: "Estimate for Dana Whitfield: tear off the old deck boards and railing, install 240 sq ft of composite decking and 36 linear feet of aluminum railing, haul away the debris. Permit fees billed at cost. Valid 30 days."

You can type it or dictate it from the truck. In ContractorDocs, open **AI Command** on the dashboard, or **AI Assistant** on a job page so the estimate is attached to that job. You can attach up to three site photos, and typing @ lets you pick the client.

## Step 3: Review the draft line by line

Nothing is saved or sent until you say so. The draft opens with **Open & edit**, **Save** and **Discard**, so treat it as a first pass. Check:

- [ ] Every task from your walkthrough is on the estimate, in the order the crew will do it
- [ ] Descriptions say what's included ("composite boards, hidden fasteners, picture-frame border"), not just "decking"
- [ ] No line describes work you didn't ask for
- [ ] Lines without a price are filled in from your own numbers
- [ ] Units make sense (sq ft for decking, lf for railing, each for fixtures)
- [ ] The client name, job address and valid-until date are right

If a line is vague, fix it now. Vague scope is how a $7,000 deck turns into a $1,500 argument.

## Step 4: Fill quantities from real measurements

AI can't measure. Quantities have to come from your takeoff, a plan or a tape on site. In ContractorDocs, the **Measure** button next to a line's quantity opens Quick measure: rooms (walls minus doors and windows), areas, linear runs, roofs by pitch, and volumes in cubic yards for concrete. Add a waste percentage for materials you cut, and set pack sizes so tile or shingles round up to whole boxes or bundles.

## Step 5: Check the margin, then add your terms

Before the estimate leaves, check that the price actually pays you. Turn on **Profit tools** on the estimate to see cost, profit and margin per line. It's for your eyes only and is never printed. Remember that markup and margin are different: a 25% markup is only a 20% margin, as our [profit margin guide](/blog/how-to-calculate-job-profit-margin) explains.

Then add the terms that protect the number: exclusions, allowances for anything the client still has to choose, the deposit and a valid-until date.

## Step 6: Send it for a signature

Save the estimate and send it with an approval link. The client opens it on their phone, reads it, types their name, draws a signature and taps **Approve & sign**, or declines with a reason. Once signed, the estimate is locked, and an accepted estimate can become an invoice with one click. Our guide to [e-signatures for contractors](/blog/e-signatures-for-contractors) covers what makes a signature hold up.

## A worked example

Here's what that deck request might produce. The prices are hypothetical examples from an imaginary price book, not market rates.

| Line (as drafted) | Qty | Unit | Price | Source |
| --- | --- | --- | --- | --- |
| Remove existing deck boards and railing | 1 | job | $900 | Price book |
| Composite decking, supply and install | 240 | sq ft | $18 | Price book |
| Aluminum railing, supply and install | 36 | lf | $55 | Price book |
| Debris haul-away and disposal | 1 | job | empty | Not in price book |

The three priced lines come to $7,200. The haul-away line has no price, so the contractor adds $350 from their own dumpster cost, and the estimate totals $7,550 before tax. Two minutes of review caught the one line the AI couldn't price and confirmed the rest came from real numbers.

## Ask for good, better and best in the same request

Clients compare. Giving them three options often helps them say yes without asking you to cut your price. Add it to your request: "good / better / best options: pressure-treated, mid-range composite, premium composite with lighting." The estimate opens with the options filled in, Better marked Recommended, and your price book prices on the lines that match. Read more in [our AI estimate generator page](/ai-estimate-generator).

## Mistakes to avoid

- **Pasting a chatbot's prices.** National averages from a general AI tool aren't your costs, your region or this month's material prices.
- **Skipping the walkthrough notes.** The AI only knows what you tell it. Hidden conditions you saw belong in the request or in the exclusions.
- **Sending without reading.** A draft is a draft. Read every line as if the client will hold you to it, because they will.
- **Forgetting exclusions.** Say what isn't included, every time.

## What it costs in ContractorDocs

Every plan includes the AI assistant. The Free plan includes 15 AI requests a month, Premium ($5 a month) includes 60 and Premium + AI ($10 a month) includes 600, for contractors who draft most of their paperwork this way. See the details on the [pricing page](/pricing). The assistant is powered by Google Gemini, and you review everything before it's saved or sent.`,
  faq: [
    {
      q: 'Can AI write a construction estimate for me?',
      a: 'AI can draft the structure, line items and wording of an estimate from a short description. You still need to supply real quantities and check the prices, exclusions and margin before sending it, because the AI doesn’t know your costs or the site conditions.',
    },
    {
      q: 'Are AI-generated estimates accurate?',
      a: 'They are as accurate as the numbers behind them. A general chatbot guesses prices from broad training data. An assistant that pulls prices from your own price book, like the one in [ContractorDocs](/ai-estimate-generator), gives you your own numbers and leaves unknown prices empty for you to fill.',
    },
    {
      q: 'Which AI model does ContractorDocs use?',
      a: 'The ContractorDocs assistant is powered by Google Gemini. It proposes drafts; nothing is created, saved or sent until you review it and click.',
    },
    {
      q: 'Does the AI see my costs and margins?',
      a: 'No. When it drafts with your price book, only item names, units, client prices, short descriptions and kit parts are sent. Your costs and margins stay in your account.',
    },
    {
      q: 'Can I use ChatGPT or another chatbot to make an estimate?',
      a: 'You can use a general chatbot to tidy up scope wording, then paste it into your estimate. It won’t know your prices, attach the estimate to a job or collect a signature, so check every number it suggests. Our [construction estimate template](/blog/construction-estimate-template) shows how to price the lines yourself.',
    },
  ],
  cta: {
    heading: 'Draft your next estimate in a minute',
    text: 'Describe the job, review the lines, send it for a signature. Every plan includes AI requests, and the Free plan needs no credit card.',
    href: '/ai-estimate-generator',
    label: 'Try the AI estimate generator',
  },
};

export default post;
