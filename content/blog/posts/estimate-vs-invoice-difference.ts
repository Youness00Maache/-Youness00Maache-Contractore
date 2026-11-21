import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'estimate-vs-invoice-difference',
  answer:
    'An estimate is a price proposal you send before the work, and the client agrees to it before you start. An invoice is a bill you send for work already done or a payment now due, such as a deposit or a progress payment. The estimate sets the deal; the invoice collects the money. Keep the numbers on both consistent so the invoice matches what was approved.',
  takeaways: [
    'An estimate comes before the work and proposes a price; an invoice asks for payment of money that is owed.',
    'A signed estimate sets the scope and price; the invoice should match it plus any approved changes.',
    'You can invoice from one estimate several times: a deposit, progress payments and a final balance.',
    'Convert an accepted estimate into an invoice rather than retyping it, so the numbers cannot drift.',
  ],
  body: `Contractors mix up these two documents all the time, and so do clients. The estimate arrives as a price, the invoice arrives as a bill, and when the numbers differ, the argument starts. Knowing what each document is for makes both easier to write and harder to dispute.

This guide explains the difference in plain terms, shows how one job flows from estimate to invoice with a worked example, and lists what each document should contain.

## The short answer

| | Estimate | Invoice |
| --- | --- | --- |
| Purpose | Propose a price and scope | Request payment |
| When you send it | Before the work | When money is due (deposit, milestone, completion) |
| Client's action | Review and approve or decline | Pay |
| Binding? | Not until accepted, and then depends on your terms | A record of what is owed under the agreement |
| Can it change? | Yes, until approved; changes after need a change order | Should match the agreement and approved changes |
| Key content | Scope, price, exclusions, terms | Amount due, due date, how to pay, what it covers |

Think of the estimate as the agreement about what you will do for how much, and the invoice as the request for each payment under that agreement.

## What an estimate does

An estimate answers the client's first question: what will this cost and what do I get? A good one includes:

- A description of the work and what is not included
- Line items for labor and materials, or a clear price for the job
- Totals, tax if applicable and any allowances
- The validity period, meaning how long the price holds
- Payment terms, such as the deposit and schedule
- A way to approve it, ideally a signature

Because an estimate sets expectations, the details protect you later. If the scope is vague, the final bill becomes an argument. The [construction estimate template](/blog/construction-estimate-template) and the [scope of work guide](/blog/how-to-write-a-construction-scope-of-work) show what to include.

Some contractors use "quote", "bid" or "proposal" for the same thing. The wording varies by trade and region, but the function is the same: a price offered before work.

## What an invoice does

An invoice asks for money that is due under the agreement. It does not set the price; it records what is owed now. A clear invoice includes:

- An invoice number and date
- The client and job details
- What the amount covers: the deposit, a milestone, extra work or the final balance
- The amount, with tax, discounts, deposits and prior payments shown
- The balance due, the due date and payment terms
- How to pay

Our guide on [how to write a construction invoice](/blog/how-to-write-a-construction-invoice) goes through each part. A useful rule: someone who has never seen the job should be able to read the invoice and know exactly why the amount is due.

## A worked example: one job, three invoices

The numbers below are an example, not a price list. A contractor agrees to a bathroom remodel for an estimated 12,000 dollars.

| Step | Document | Amount | What it is |
| --- | --- | --- | --- |
| 1 | Estimate | 12,000 | Scope, price, terms, signed by the client |
| 2 | Invoice 1: deposit | 3,000 | 25% due before start, per the estimate's terms |
| 3 | Invoice 2: milestone | 4,500 | Due when demolition and rough-in pass inspection |
| 4 | Change order | 800 | Client adds a niche; approved in writing |
| 5 | Invoice 3: final | 5,300 | 4,500 remaining plus the 800 change |

Check the final: 12,000 + 800 = 12,800 total. Minus the 3,000 deposit and the 4,500 milestone leaves 5,300. The invoice shows each of those, so the client can follow the math.

The pattern: one estimate, several invoices, and changes added by change order. If instead you only issue a single invoice at the end for a number nobody has seen, expect questions. For how changes fit in, see the [change order guide](/blog/change-order-form-guide).

## How the two documents protect you

Each document answers a different question if a dispute comes up. The estimate shows what the client agreed to: the scope, the price, the exclusions and the terms. The invoice shows what you asked for and when, and what was already paid. If a client says "I never agreed to that amount", the signed estimate and the approved change orders are your answer. If the client says "I already paid that", the invoice with its payment history is the answer.

That is why the two should never contradict each other. Imagine an estimate that says 12,000 dollars and a final invoice that says 13,400 with no explanation. Even if the extra 1,400 was real work, the client sees a surprise, and surprises turn into delays. When every difference is traceable to a signed change order, the invoice reads as a confirmation instead of a new demand.

A few habits keep it that way:

- Put the estimate number on every invoice that comes from it, so the link is visible.
- Keep deposits and progress payments listed on every later invoice, with dates.
- Write the validity period and payment schedule on the estimate, so the invoices follow terms the client has already seen.
- Keep both documents in the job's folder, not scattered across email and texts.

## Common mistakes

- **Invoicing a different number than the estimate** without a written change. This is the biggest source of disputes.
- **Treating an estimate as a bill.** A client who has not approved has not agreed to pay.
- **No scope on the estimate**, so the invoice cannot be tied to anything.
- **Retyping the estimate into an invoice**, which invites typos and mismatched totals.
- **Skipping deposits** because the estimate looks like enough protection. It is not money.
- **Forgetting prior payments** on the final invoice, which overcharges the client and wrecks trust.

## From estimate to invoice without retyping

The cleanest workflow is to build the estimate once, get it approved, and turn it into invoices from the same data. That way the line items, tax and terms carry over and the amounts match.

In ContractorDocs, an accepted estimate can be converted into an invoice for the whole amount, for the deposit, or for a later payment, so you do not retype lines. Clients approve and sign estimates on a phone from a link, with no account, and the signed estimate stays tied to the job. The [estimate generator](/estimate-generator) and [invoice generator](/invoice-generator) are free to start with. See [e-signatures for contractors](/blog/e-signatures-for-contractors) for how the signing part works.

## Which one do you need right now?

- **A customer asks what the job will cost:** send an estimate.
- **The customer has said yes and you need a deposit:** send an invoice for the deposit, based on the approved estimate.
- **A milestone is done and a payment is due:** send a progress invoice.
- **The customer asks for something extra:** write a change order, then include it on the next invoice.
- **The job is finished:** send the final invoice with the balance and every prior payment shown.

## Checklist: keep estimate and invoice consistent

- [ ] The estimate has scope, price, exclusions, validity and payment terms
- [ ] The client approved it in writing or by e-signature
- [ ] Each invoice says what it covers (deposit, milestone, change, final)
- [ ] Every approved change order is written and referenced
- [ ] The final invoice shows the original price, changes, payments and balance
- [ ] Numbers were converted from the estimate, not retyped

## What this guide does not cover

It does not cover tax rules, which vary by state and trade, or legal requirements for contracts in your state, such as required notices or cancellation rights on home improvement work. Check your state's rules or ask an attorney if you are unsure.`,
  faq: [
    {
      q: 'Is an estimate legally binding?',
      a: 'It depends on how it is written and what your state requires. A signed estimate with a clear scope and price often works as an agreement, while a rough verbal number does not. Check your state’s rules and consider an attorney for large jobs.',
    },
    {
      q: 'Can I turn an estimate into an invoice?',
      a: 'Yes, and it is the better way to do it. Convert the approved estimate so the lines and totals carry over, then adjust for deposits, progress payments and approved changes.',
    },
    {
      q: 'What is the difference between an estimate and a quote?',
      a: 'In practice the words are used interchangeably. Some contractors use "estimate" for an approximate price and "quote" for a fixed one, so say clearly on the document which kind it is.',
    },
    {
      q: 'Do I need an invoice if the client signed an estimate?',
      a: 'Yes. The estimate sets the deal, but the invoice is the record of each payment that is due and what it covers. See [how to write a construction invoice](/blog/how-to-write-a-construction-invoice).',
    },
    {
      q: 'What if the final invoice is higher than the estimate?',
      a: 'Only if the extra comes from approved changes. Write each change up as a change order and get approval before the work, then show it on the invoice.',
    },
  ],
  cta: {
    heading: 'Turn estimates into invoices without retyping',
    text: 'Build the estimate, get it signed on a phone, then invoice the deposit, progress payments and balance from the same numbers. Free to start.',
    href: '/estimate-generator',
    label: 'Start with an estimate',
  },
};

export default post;
