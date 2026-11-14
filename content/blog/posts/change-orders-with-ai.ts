import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'change-orders-with-ai',
  answer:
    'To write a change order with AI, describe the change in one message (what is added or removed, why, the quantities and any extra days), let the assistant draft the scope and lines, then check the price, the schedule impact and the new contract total before you send it for signature. Get the client to sign on their phone before the extra work starts.',
  takeaways: [
    'Write the change order on site, the day the change comes up, while the details are fresh.',
    'Tell the AI the what, the why, the quantities and the days added. It can’t see the job.',
    'Prices should come from your price book or your own numbers; check every line before sending.',
    'Signed before the work starts, with a running contract total, is what makes a change order collectible.',
  ],
  howTo: {
    name: 'How to write a change order with AI',
    totalTime: 'PT10M',
    steps: [
      { name: 'Capture the change on site', text: 'Note what is added or removed, why, who asked for it, the quantities and a photo of the condition.' },
      { name: 'Describe it to the assistant', text: 'In one message, give the job, the change, the reason, the quantities, any credit for removed work and the days added.' },
      { name: 'Review the draft', text: 'Check the scope wording, each line and price, the schedule impact and that nothing was added you did not ask for.' },
      { name: 'Check the contract total', text: 'Confirm the original contract value, earlier approved changes, this change and the new total.' },
      { name: 'Send it for signature before work starts', text: 'Send the approval link by email, text or WhatsApp and wait for the client’s signature.' },
      { name: 'Log it and bill it', text: 'Keep the signed change order with the job and put it on its own line on the next invoice.' },
    ],
  },
  body: `You can write a change order with AI in a few minutes on the job site: describe the change in one message, let the assistant draft the scope and line items, check the price and the days added, and send it to the client for signature before the extra work starts. The AI handles the wording. You make sure the numbers are right.

Change orders are where small contractors lose the most money for the least reason. The work is real, the client asked for it, and everyone agreed out loud. But without a signed document, the extra shows up on the final invoice as a surprise, and surprises get disputed. The usual excuse is time: nobody wants to write a formal document on a tailgate. That's exactly the part AI makes fast.

## What a change order needs, whoever writes it

AI doesn't change what belongs on a change order. Our [change order form guide](/blog/change-order-form-guide) covers it in detail; the short version:

| Field | Example |
| --- | --- |
| Change order number | CO-02 |
| Job and original contract | Whitfield deck, contract dated May 4 |
| Description of change | Add 12 lf aluminum railing on stairs, add 2 step lights |
| Reason | Client request during framing |
| Price of the change | Lines with quantities and prices |
| Credit for removed work | None |
| Schedule impact | Adds 1 working day |
| Contract total | Original + prior changes + this change |
| Signatures and date | Client and contractor |

## Step 1: Capture the change on site

The best time to write a change order is the moment the change comes up. Before you leave the spot, note:

- What's being added, removed or changed, with quantities
- Why: client request, hidden condition, code requirement or design change
- Who asked, and when
- A photo of the condition, especially for hidden damage

If the change comes from something you found, such as rot behind a wall, also note it in your [daily job report](/blog/daily-job-report-template). That report is your record of when you found the condition and what you told the client.

## Step 2: Describe the change to the assistant

Give the AI the same facts in one message. It can't see the job, so anything you leave out won't be on the change order.

> Example request: "Change order for the Whitfield deck: client asked for 12 linear feet of aluminum railing on the stairs and two step lights. Wiring for the lights by our electrician, 2 hours. Adds one working day. Client request during framing."

In ContractorDocs, open **AI Assistant** on the job page so the change order is attached to the right job and client, then type or dictate the request. You can attach up to three photos. The assistant drafts the change order with the description, reason, line items and schedule note. Nothing is saved or sent until you review it.

When the change matches items in your price book, those lines get your prices, units and kit parts. Lines that aren't in your price book stay empty, so the assistant never invents a price; you fill those in.

## Step 3: Review the draft

Read the draft like the client will. Check:

- [ ] The description is specific enough that nobody could argue about what's included
- [ ] The reason is stated, especially for hidden conditions
- [ ] Every line has a quantity, a unit and a price from your own numbers
- [ ] Credits for removed work are shown as negative lines
- [ ] The days added are stated, even if it's zero
- [ ] Nothing appears that you didn't ask for

## A worked example

Here's what the Whitfield request might produce. The prices are hypothetical, from an imaginary price book.

| Line | Qty | Unit | Price | Total |
| --- | --- | --- | --- | --- |
| Aluminum stair railing, supply and install | 12 | lf | $55 | $660 |
| LED step light, supply and install | 2 | each | $140 | $280 |
| Electrical wiring for step lights | 2 | hours | filled in by contractor: $95 | $190 |
| **Change order total** | | | | **$1,130** |

The railing and lights came from the price book. The electrician's hours weren't in it, so the contractor filled in the rate. With the original contract at $7,550 and no earlier changes, the new contract total is $8,680, and the finish date moves by one working day.

## Step 4: Check the contract total

A change order should always show the running total: the original contract value, earlier approved changes, this change and the new total. It stops the "I thought the price was..." conversation at the final invoice.

In ContractorDocs, a change order's current contract value is filled in from the accepted estimate plus earlier approved change orders, and each change order has a status: Draft, Sent or Approved. Approved change orders also raise the job's budget in **Financials**, so budget vs actual stays accurate. Our guide to [tracking job costs](/blog/job-costing-budget-vs-actual) explains how that comparison works.

## Step 5: Send it for signature before the work starts

This is the step that matters most. Save the change order and send the approval link: by email from your own Gmail, or with the Text and WhatsApp buttons, which open your phone's messaging app with the link filled in. The client reads it on their phone, types their name, draws a signature and taps **Approve & sign**, or declines with a reason.

Once signed, the change order is locked. If something changes again, write a new change order rather than editing the signed one. Our article on [sending documents clients can sign on their phone](/blog/send-estimate-clients-can-sign-on-phone) covers the details, and [e-signatures for contractors](/blog/e-signatures-for-contractors) covers what makes them hold up.

## Hidden conditions: the change order nobody planned

Client requests are the easy kind. The harder kind is the change you find: rotten subfloor under the old tile, wiring that isn't to code, a beam that isn't where the plans say. These need a change order just as much, and the reason matters more, because the client didn't ask for the extra cost.

For hidden conditions, stop and document before you fix anything. Take photos, note the date and time, and tell the client what you found and what it will take. Then give the assistant the same facts: "Change order: found rotten subfloor under the bathroom tile, about 40 sq ft, needs replacing before new tile. Hidden condition, found during demo. Adds two days." Attach the photos to the request. A clear reason, a photo and a signature turn an argument into a decision.

## Step 6: Log it and bill it

Keep every change order with the job, numbered in order. On the next invoice, list each signed change order on its own line, so the client can match it to what they signed. If you bill progress payments, include approved changes in the schedule from the next payment on.

## Common mistakes with AI-written change orders

- **Vague prompts.** "Extra railing" gives you a vague change order. Give lengths, counts and products.
- **Trusting a price you didn't set.** If a price didn't come from your price book or your own math, check it.
- **Starting before the signature.** A drafted change order isn't an agreement until it's signed.
- **Skipping zero-cost changes.** Even a free change, like moving an outlet, deserves a signed record so it doesn't become a dispute.

## What it costs

The AI assistant is on every ContractorDocs plan: 15 requests a month on Free, 60 on Premium ($5 a month) and 600 on Premium + AI ($10 a month). Change orders, approval links and e-signatures are included on every plan. See the [AI invoice and change order generator](/ai-invoice-generator) for what else it drafts, or the [features page](/features#ai-assistant).`,
  faq: [
    {
      q: 'Can AI write a construction change order?',
      a: 'Yes. Describe the change, the reason, the quantities and any days added, and an AI assistant can draft the description, lines and schedule note. You still check the prices and the contract total and get the client’s signature before the work starts.',
    },
    {
      q: 'Will the AI make up prices for my change order?',
      a: 'In ContractorDocs, no. Lines that match your price book get your prices; other lines stay empty for you to fill in. A general chatbot, by contrast, may suggest prices that aren’t yours, so check anything it gives you.',
    },
    {
      q: 'Should a change order show the new contract total?',
      a: 'Yes. Show the original contract value, earlier approved changes, this change and the new total, so the client and your invoices always agree. Our [change order guide](/blog/change-order-form-guide) shows the full layout.',
    },
    {
      q: 'Can the client sign a change order on their phone?',
      a: 'Yes. Send the approval link by email, text or WhatsApp. The client reads the change order, types their name, draws a signature and taps Approve & sign. Signed change orders are locked.',
    },
    {
      q: 'Do I need a change order if the change is free?',
      a: 'It’s still a good idea. A signed no-cost change order records what changed and that the client agreed, which prevents disputes about scope later.',
    },
  ],
  cta: {
    heading: 'Write your next change order before the work starts',
    text: 'Describe the change, check the draft and send it for a signature on the client’s phone, all from the job site.',
    href: '/ai-invoice-generator',
    label: 'See what the AI drafts',
  },
};

export default post;
