import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'progress-billing-schedule-of-values-for-contractors',
  answer:
    'Progress billing means invoicing a job in stages as work is completed. You split the contract into line items (a schedule of values), record the percent complete of each line every billing period, and bill the new amount minus what you already billed. The worked example below shows the math for three billing periods.',
  takeaways: [
    'A schedule of values breaks the contract total into lines that add up exactly to the contract price.',
    'Each invoice bills percent complete times the line value, minus what earlier invoices already billed.',
    'Front-loading is tempting but risky: bill what is truly done, and keep the final slice for closeout.',
    'Change orders are added as new lines so the total and the history stay clear.',
    'If a retainage is held, track it separately, and check your state rules on how it works.',
  ],
  howTo: {
    name: 'How to do progress billing with a schedule of values',
    totalTime: 'PT30M',
    steps: [
      { name: 'Build the schedule of values', text: 'Split the contract price into work lines that add up exactly to the total.' },
      { name: 'Agree the billing dates', text: 'Write when you will bill (for example the 25th of each month) and how the client approves progress.' },
      { name: 'Record percent complete', text: 'At each billing date, walk the job and record the percent complete for every line.' },
      { name: 'Calculate this invoice', text: 'For each line multiply value by percent complete, then subtract the amounts billed on earlier invoices.' },
      { name: 'Handle changes and retainage', text: 'Add approved change orders as new lines and track any retainage held back.' },
      { name: 'Send and reconcile', text: 'Send the invoice, record the payment and check that billed to date never exceeds work done.' },
    ],
  },
  body: `A kitchen remodel takes eight weeks and costs $30,000. You cannot wait until the last day to be paid. You also cannot send a vague "second payment, $10,000" invoice and expect the client to approve it without a question.

Progress billing solves both problems. You invoice in stages, and each invoice shows exactly which parts of the job are done. This guide explains the method, the schedule of values that makes it work, and a three-period example with the math. All numbers are examples. Payment rules, retainage and lien rights vary by state, and this is not legal advice.

## Progress billing in one paragraph

You agree a contract price. You split it into lines (a schedule of values). On each billing date you record how complete each line is. The invoice bills the value of the work completed to date, minus what you billed before. When all lines reach 100%, you have billed the full contract price and nothing more.

It differs from a deposit plus a fixed milestone schedule in one way: the amounts are driven by measured work, not by dates alone. Both are fine. Milestones are simpler for small jobs, and progress billing fits longer jobs with many trades. If you are choosing how to price the whole job first, see [time and materials vs fixed price](/blog/time-and-materials-vs-fixed-price-contract).

## Step 1: Build the schedule of values

A schedule of values (SOV) is a table that splits the contract total into lines. The lines must add up exactly to the contract price. Use the same words your estimate used, so the client recognises each line.

Example SOV for a $30,000 kitchen remodel:

| Line | Description | Value |
| --- | --- | --- |
| 1 | Demolition and disposal | $2,500 |
| 2 | Framing and rough-in (plumbing, electrical) | $6,000 |
| 3 | Cabinets supply and install | $9,000 |
| 4 | Countertops | $4,500 |
| 5 | Tile backsplash and flooring | $3,500 |
| 6 | Paint, trim and finish | $3,000 |
| 7 | Cleanup and closeout | $1,500 |
| Total | | $30,000 |

Do not make the lines too big or too small. Seven to fifteen lines is enough for most residential jobs. One line called "Labor" and one called "Materials" hides the progress, while fifty tiny lines are tedious to update.

## Step 2: Agree how and when you bill

Write it in the contract: the billing date (for example the 25th), how percent complete is judged (your walk-through, with photos), how long the client has to pay, and what happens to disputed items. This turns billing into a routine instead of an argument. The same reasoning goes into a good [scope of work](/blog/how-to-write-a-construction-scope-of-work), which should be agreed before the schedule of values.

## Step 3: Record percent complete, then calculate the invoice

At each billing date, walk the job and write down the percent complete for each line. Be honest and conservative. Clients and lenders check, and overbilling damages trust.

The formula per line is:

Work completed to date = line value x percent complete
This invoice = work completed to date minus the amount billed on previous invoices

## Example: three billing periods

Using the SOV above. Percent complete is an example.

| Line | Value | Period 1 | Period 2 | Period 3 |
| --- | --- | --- | --- | --- |
| 1 Demolition | $2,500 | 100% | 100% | 100% |
| 2 Framing and rough-in | $6,000 | 60% | 100% | 100% |
| 3 Cabinets | $9,000 | 0% | 50% | 100% |
| 4 Countertops | $4,500 | 0% | 0% | 100% |
| 5 Tile and flooring | $3,500 | 0% | 0% | 60% |
| 6 Paint and trim | $3,000 | 0% | 0% | 0% |
| 7 Cleanup | $1,500 | 0% | 0% | 0% |

Now the invoices:

| | Work done to date | Billed before | This invoice |
| --- | --- | --- | --- |
| Period 1 | $2,500 + $3,600 = $6,100 | $0 | $6,100 |
| Period 2 | $2,500 + $6,000 + $4,500 = $13,000 | $6,100 | $6,900 |
| Period 3 | $2,500 + $6,000 + $9,000 + $4,500 + $2,100 = $24,100 | $13,000 | $11,100 |

After period 3, $24,100 has been billed and $5,900 remains (paint, cleanup and the rest of the tile). The final invoice bills the balance when everything is done. Each invoice shows the lines, the percent complete and the amount, so the client can see exactly why the number is what it is.

## What to do when the client disputes a line

Sooner or later a client says a line is not as far along as you billed. Keep it calm and factual:

1. Walk the job together and compare the work with the line description in the schedule of values.
2. Agree a percent complete for the disputed line only. Do not reopen the lines nobody questioned.
3. Issue a corrected invoice, or a credit on the next one, and write the agreed figure on your record.
4. If you cannot agree, ask for payment of the undisputed lines on time and settle the rest separately.

Photos taken at each billing date make this conversation short, because both sides can see the state of the work on that day. A [daily job report](/blog/daily-job-report-template) kept through the job gives you the same evidence for free.

## Changes during the job

When the client asks for extra work, do not bury it in the existing lines. Write a [change order](/blog/change-order-form-guide), get it signed, and add it to the schedule as a new line with its own value. The contract total goes up, the new line gets its own percent complete, and the original lines stay intact. That keeps the history clean if there is a later dispute.

## Retainage and deposits

Some contracts hold back a percentage of every invoice (retainage) until the job is finished. If yours does, track the held amount separately and bill it at closeout. Whether retainage is allowed, how much, and when it must be released varies by state, so check your rules before you agree to it.

If you took a deposit at the start, treat it as a credit against the first invoices so the client is not billed twice. See [how much deposit a contractor can ask for](/blog/how-much-deposit-can-a-contractor-ask-for).

## Common mistakes

- Front-loading: billing more than the work done to get cash early. It breaks trust and can break the contract.
- Lines that do not add up to the contract price.
- Forgetting to subtract what was billed before.
- Billing materials stored off site without agreeing it first.
- Skipping lien waivers when payments are made. See [lien waivers explained](/blog/lien-waivers-explained).
- Leaving no money for closeout, so nobody is motivated to finish the punch list.

## Checklist for every progress invoice

- [ ] The schedule of values adds up to the contract price
- [ ] Percent complete was checked on site, with photos
- [ ] Each line bills value x percent minus billed before
- [ ] Approved change orders are added as separate lines
- [ ] The deposit and any retainage are shown clearly
- [ ] The invoice shows the total billed to date and the balance remaining
- [ ] A lien waiver is ready for the payment received

## Doing it in ContractorDocs

You do not have to build this table in a spreadsheet each month. In ContractorDocs an invoice can switch to progress billing in its Items, and when you convert an accepted estimate to an invoice you can choose a later payment as a progress billing invoice with the right percent complete and what was billed before. Details are on the [features page](/features#documents), and the free plan is enough to try it on a job. If you need a plain invoice for a small job, the [invoice generator](/invoice-generator) is faster.

## What this does not cover

This guide covers private residential-style work. Public projects, lender draws and bonded jobs have their own forms and rules, and payment and lien timing laws vary by state. Confirm the rules that apply to you.`,
  faq: [
    {
      q: 'What is a schedule of values?',
      a: 'A schedule of values splits the contract price into work lines that add up exactly to the total. Each billing period you record percent complete per line and invoice the difference from what was billed before.',
    },
    {
      q: 'How do you calculate progress billing?',
      a: 'For each line multiply the line value by the percent complete, add the lines for the work done to date, then subtract the total billed on earlier invoices. The result is this invoice.',
    },
    {
      q: 'What is the difference between progress billing and milestone billing?',
      a: 'Milestone billing charges fixed amounts when named stages finish. Progress billing charges the value of work completed on each line in each period. Milestones suit shorter jobs, progress billing suits longer ones.',
    },
    {
      q: 'How do change orders fit into progress billing?',
      a: 'Add each approved [change order](/blog/change-order-form-guide) as a new line with its own value and track its percent complete like any other line.',
    },
    {
      q: 'Is retainage required on progress billing?',
      a: 'No, it depends on the contract and your state. If it is used, track the held amount separately and bill it at closeout. Check your state rules first.',
    },
  ],
  cta: {
    heading: 'Bill each stage without a spreadsheet',
    text: 'Convert an accepted estimate into a progress invoice and keep every billing period on the job, in the free plan.',
    href: '/auth/signup',
    label: 'Try ContractorDocs free',
  },
};

export default post;
