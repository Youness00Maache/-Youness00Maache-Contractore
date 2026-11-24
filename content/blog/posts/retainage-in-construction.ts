import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'retainage-in-construction',
  answer:
    'Retainage in construction is a percentage of each progress payment that the owner or general contractor holds back until the job is finished, as security that the work gets completed and corrected. The contract sets the percentage and when it is released, and many states limit it. Track it as money owed to you and invoice the release as soon as the conditions are met.',
  takeaways: [
    'Retainage (also called retention) is your money, held back from each progress payment until completion.',
    'The contract sets the rate and the release conditions; state law often caps it, especially on public work.',
    'Show gross amount, retainage held and net due on every progress invoice, plus retainage held to date.',
    'Release usually depends on completion, the punch list and closeout papers, so finish those fast.',
    'Flow-down: if you hold retainage on your subs, match it to what is held on you, and track both sides.',
  ],
  howTo: {
    name: 'How to bill and collect retainage on a construction job',
    totalTime: 'PT30M',
    steps: [
      { name: 'Read the retainage clause', text: 'Find the percentage, whether it drops after a milestone, and the conditions and timing for release.' },
      { name: 'Show it on every progress invoice', text: 'List the gross amount for the period, the retainage held, the net amount due and the retainage held to date.' },
      { name: 'Keep a retainage ledger', text: 'Record, per job, what was held on each invoice and what was released, so the balance is always known.' },
      { name: 'Meet the release conditions', text: 'Finish the punch list, hand over closeout documents and lien waivers, and get completion confirmed in writing.' },
      { name: 'Invoice the release', text: 'Send a separate retainage release invoice for the full balance the day the conditions are met, and follow it up like any invoice.' },
    ],
  },
  body: `On a job with progress billing, the invoice you send and the check you get are often not the same number. The difference is retainage: a share of every payment the client keeps until the end. On a large job, that can add up to the profit on the whole project, sitting in someone else's account for months.

This guide explains how retainage works, what is common, a worked example, how to show it on invoices and how to get it released without waiting longer than you have to.

## What is retainage in construction?

Retainage is an amount withheld from each progress payment until the work is complete. It is security for the owner: if the contractor walks off the job or leaves defects, the held money helps pay to finish or fix the work. It is also an incentive to finish the last items quickly.

The same thing is called retention, retainer or holdback. "Retainage" is the usual US term.

Retainage is not a discount and not a fee. It is part of the contract price that has been earned but not yet paid.

## How does retainage work?

1. The contract states a retainage percentage, for example 10% of each progress payment.
2. Each period you bill the work completed. The client pays the amount minus the retainage.
3. The withheld amounts add up over the job.
4. Some contracts reduce the rate after a milestone, such as 50% completion, or stop withholding after that point.
5. At the end (often substantial or final completion, after the punch list and closeout papers), the held balance is released in one payment or in stages.

## How much retainage is normal?

Figures of 5% or 10% are the ones you will see most often, but the contract decides, and many states regulate retainage. Some cap the percentage, some set deadlines for releasing it after completion, some require it to be held in a separate account or let the contractor substitute a bond or securities, and some apply rules only to public projects. Rules vary by state and by project type, and this is not legal advice. Before you sign, check your state's prompt payment and retainage rules, and read whether the rate drops at any point.

## Retainage example: a $120,000 job

Example only; the numbers are not a benchmark. A $120,000 contract with 10% retainage, billed in four progress invoices.

| Invoice | Work billed this period | Retainage held (10%) | Paid to you | Retainage held to date |
| --- | --- | --- | --- | --- |
| 1 | $30,000 | $3,000 | $27,000 | $3,000 |
| 2 | $36,000 | $3,600 | $32,400 | $6,600 |
| 3 | $33,000 | $3,300 | $29,700 | $9,900 |
| 4 | $21,000 | $2,100 | $18,900 | $12,000 |
| Retainage release | | | $12,000 | $0 |

By the end of invoice 4 you have done all the work and been paid $108,000. The last $12,000 waits for the release conditions. If your profit on the job is around that number, your profit is the retainage. That is why chasing the release matters as much as chasing any invoice.

## When is retainage released?

The contract sets it. Common conditions are:

- Substantial or final completion, confirmed in writing
- The [punch list](/blog/punch-list-template-for-contractors) finished and verified
- Closeout documents handed over: warranties, manuals, as-builts, inspection sign-offs
- [Lien waivers](/blog/lien-waivers-explained) from you and, often, from your subs and suppliers

Many state laws also set a deadline for the owner to release retainage once the conditions are met. The [job closeout checklist](/blog/job-closeout-checklist-for-contractors) covers the end-of-job papers so none of them is the reason your money is held.

## How to show retainage on an invoice

Every progress invoice on a retainage job should show:

| Line | Example |
| --- | --- |
| Contract total (with approved change orders) | $120,000 |
| Work completed to date | $66,000 |
| Less previous billing | $30,000 |
| Work billed this period | $36,000 |
| Less retainage (10%) | $3,600 |
| Amount due this invoice | $32,400 |
| Retainage held to date | $6,600 |

The "retainage held to date" line is the one many small contractors leave out, and then nobody, including you, knows the balance at the end. The [progress billing and schedule of values guide](/blog/progress-billing-schedule-of-values-for-contractors) shows the full layout for the rest of the invoice.

When the conditions are met, send a separate retainage release invoice for the balance. Do not fold it into a final progress invoice where it is easy to miss.

## Retainage for subcontractors

If an owner holds 10% on you, a general contractor usually holds the same on subs, so the money flows down in step. Hold more than is held on you and subs will price it in; hold less and you fund the difference yourself. Track both sides per job: what is held on you and what you hold on each sub, and when each is due.

In ContractorDocs, the Subs tab on a job (part of [Premium](/pricing)) records a subcontract with its scope, amount and retainage percentage. Payments are logged against it, the retainage stays held until you mark the work completed, and Job financials shows committed, paid, still to pay and retainage held. For retainage held on you, the progress billing invoice tracks what was billed before and the percent complete, and a simple ledger like the table above keeps the held balance visible.

## How to protect your cash flow from retainage

- [ ] Read the retainage clause before you sign, and ask for a reduction after 50% completion
- [ ] Ask whether a bond or other security can replace cash retainage, where your state allows it
- [ ] Price the cost of waiting for the money into the job
- [ ] Show retainage held to date on every invoice
- [ ] Start closeout papers before the last week of the job
- [ ] Invoice the release the day the conditions are met, and put a follow-up date in your calendar
- [ ] Match the retainage you hold on subs to what is held on you

If the release is late, treat it like any overdue invoice: a polite reminder, then a firm one. The [past-due invoice letters](/blog/past-due-invoice-letter-templates-for-contractors) work for retainage too; mention the date the release conditions were met.

## What if the retainage is not released?

Start by finding out why. Most late releases have a paperwork reason: a punch item the owner does not consider finished, a missing warranty or manual, a lien waiver from a supplier, or an inspection sign-off nobody forwarded. Ask in writing: "What is still needed for the retainage release on (job)?" A written answer gives you a list to close, and it shows the date you asked.

Then work through it:

1. Close every item on that list and send proof: photos, the signed punch list, the documents.
2. Send the release invoice again with the completion date and the date the conditions were met.
3. Follow up on a fixed schedule, just like a normal overdue invoice.
4. If the holdup is your own sub or supplier paperwork, chase that first; it is often the fastest fix.
5. If nothing moves, check your state's prompt payment and lien rules before deadlines pass, and get advice.

Keep the conversation calm and specific. A client who is still deciding whether the job is finished responds better to "here is the signed punch list and the warranty" than to a demand. The guide on [what to do when a client won't pay](/blog/what-to-do-when-a-client-wont-pay-a-contractor) covers the next steps if it turns into a real dispute.

## What this does not cover

Public projects, federal work and large commercial contracts often have specific retainage, bonding and escrow rules. Lien deadlines may also run from completion and are not paused while you wait for retainage. Rules vary by state, and this guide is not legal advice; for a disputed or large amount, talk to a construction attorney.`,
  faq: [
    {
      q: 'What does retainage mean on an invoice?',
      a: 'It is the part of the invoice amount the client holds back until the job is complete. The invoice shows the gross amount, the retainage held and the net amount due now.',
    },
    {
      q: 'Is retainage the same as a deposit?',
      a: 'No. A deposit is paid to you before work starts. Retainage is held back from you during the job and paid at the end. See [how much deposit a contractor can ask for](/blog/how-much-deposit-can-a-contractor-ask-for).',
    },
    {
      q: 'When should retainage be paid?',
      a: 'When the conditions in the contract are met, usually completion, the punch list and closeout documents. Many states also set a deadline for release; rules vary by state.',
    },
    {
      q: 'Can retainage be reduced during the job?',
      a: 'Some contracts reduce or stop retainage after a milestone such as 50% completion. Ask for it before signing; it is easier to agree then than mid-job.',
    },
    {
      q: 'How do I invoice for retainage release?',
      a: 'Send a separate invoice for the full retainage balance once the release conditions are met, with the completion date and the closeout items attached. You can see an invoice layout in the free [invoice generator](/invoice-generator).',
    },
  ],
  cta: {
    heading: 'Bill in stages and keep the balance visible',
    text: 'Progress invoices with percent complete and what was billed before, on a free plan. Subcontract retainage tracking is in Premium.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
