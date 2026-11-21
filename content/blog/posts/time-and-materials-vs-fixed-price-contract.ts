import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'time-and-materials-vs-fixed-price-contract',
  answer:
    'Use a fixed price when you can define the job clearly and you have done similar work before, so the risk of a wrong guess is small. Use time and materials when hidden conditions or an unsettled scope make an honest fixed number impossible, and add a not-to-exceed cap if the client needs a budget limit.',
  takeaways: [
    'Fixed price moves the risk of a bad estimate to you; time and materials moves it to the client.',
    'The deciding question is how well the scope is known before work starts, not which model earns more.',
    'Time and materials only works with clean records: hours, materials and receipts per job, every day.',
    'A not-to-exceed cap or a fixed price with allowances are common middle paths.',
    'Whatever you choose, write the pricing method, rates and change process into the signed estimate.',
  ],
  body: `Two contractors bid the same bathroom. One quotes a fixed price. The other quotes an hourly rate plus materials. The fixed number looks safer to the homeowner, so it often wins. Then the floor comes up, the subfloor is rotten, and one of those two contractors is about to have a bad week.

Which one depends entirely on how the contract was written. This guide compares the two pricing models from the contractor's side, shows the same job priced both ways, and gives you a simple test for picking one. Numbers below are examples only. Contract rules differ by state, and this is not legal advice.

## The two models in one table

| | Fixed price (lump sum) | Time and materials (T&M) |
| --- | --- | --- |
| What the client pays | One agreed total | Actual hours at an agreed rate, plus materials (often with a markup) |
| Who carries the risk of a wrong estimate | You | The client |
| What the client likes | A known number for budgeting | Paying only for work actually done |
| What you like | Keep the gain when you work faster than planned | Hidden problems are paid for, not absorbed |
| Paperwork needed | A tight scope, exclusions and change orders | Daily time records, material logs and receipts the client can check |
| Typical fit | Repeat work with a clear scope | Repairs, remodels with unknowns, scope still changing |
| Main danger | Underestimating eats your margin | Client distrust, disputes about hours, losing bids to a fixed number |

Neither column is better in general. They answer different situations.

## How each model makes or loses money

On a fixed price job, your profit is the price minus what the job really cost. Finish faster than estimated and you keep the difference. Run into extra hours that are not covered by a change order and they come out of your margin, hour by hour. Your skill at estimating is the business.

On a T&M job, your profit is built into the rate and the material markup. Every hour worked earns the same margin, so a surprise does not hurt you. The ceiling is lower, though: working faster means billing fewer hours. And because the client sees every hour, you will be asked to justify them.

If you are not sure what your hourly rate needs to be to make a T&M job profitable, start with [how to set your contractor labor rate](/blog/how-to-set-your-contractor-labor-rate).

## Example: the same job priced both ways

A small bathroom floor replacement. All figures are made-up examples.

Your estimate: 24 labor hours, $900 of materials. Your loaded labor rate including profit is $80 an hour, and you mark up materials by 15%.

| Line | Fixed price quote | T&M quote |
| --- | --- | --- |
| Labor | 24 h x $80 = $1,920 (built into the total) | $80 per hour, billed as worked |
| Materials | $900 + 15% = $1,035 (built in) | Cost + 15%, billed with receipts |
| Contingency for unknowns | $300 | None needed |
| What the client sees | $3,255 total | Rate sheet and an estimated range |

Now the subfloor turns out to be rotten and adds 10 hours and $250 of material.

- Fixed price, no change order clause for hidden conditions: the client still pays $3,255. Your cost rose by 10 unpaid hours plus $250 of material, and the $300 contingency covered only a small part of it.
- Fixed price with a hidden-conditions clause and a signed [change order](/blog/change-order-form-guide): you price the extra work, the client signs, you bill it.
- T&M: the client pays 34 hours and the extra material. No argument about whether it was in scope, but possibly an argument about whether 10 hours was reasonable.

The lesson: a fixed price is only as safe as its scope, its exclusions and its change process.

## A simple test for choosing

Answer these five questions about the job:

1. Have you done this exact kind of job at least a few times and tracked the real hours?
2. Can you see everything you will work on, or can you open it up before you price?
3. Has the client decided what they want (finishes, layout, fixtures)?
4. Is the job small enough that one surprise would not wipe out the profit?
5. Will the client accept a written exclusions list and pay for change orders?

Mostly yes: a fixed price is reasonable, and it usually wins more work because clients like a known number. Mostly no: T&M, or one of the hybrids below. If you have never done the job before, T&M or a capped T&M lets you learn what it really takes before you commit to a number next time.

## Middle paths that small contractors use

- Not-to-exceed (capped) T&M: you bill hours and materials, but the total cannot go above an agreed cap without a signed change. The client gets a budget limit, you get paid for actual work up to that point. Set the cap with enough room, because the risk above it is yours.
- Fixed price with allowances: a fixed price for the defined work, plus allowance lines for things not yet chosen (for example tile at a stated amount per square foot). If the client picks something more expensive, the difference is billed.
- Fixed price per phase: price demolition and inspection first. Once the walls are open, price the rest as a fixed number.
- Fixed price with a unit rate for unknowns: for example, rotten subfloor replaced at a stated price per sheet if found. The client knows the rule in advance.

Each of these depends on wording. Put the method in the estimate the client signs, not in a text message. If you present options, [good, better, best pricing](/blog/good-better-best-pricing-for-contractors) shows how to lay them out.

## What to write in the estimate either way

For a fixed price job:

- A clear [scope of work](/blog/how-to-write-a-construction-scope-of-work) with inclusions and exclusions
- How hidden conditions are handled
- That changes need a signed change order before work starts
- The payment schedule, for example deposit, progress payments, final payment

For a T&M job:

- Hourly rates per role, and any minimums or travel charges
- How materials are billed (cost plus a stated markup, with receipts on request)
- An estimated range, clearly marked as an estimate
- How often you invoice (weekly, per phase) and what backup you attach
- The cap, if there is one, and what happens when you approach it

## Records that make T&M disputes rare

T&M is fair to both sides only when the records are good. The client has to trust the hours. That means time recorded the same day, material purchases tied to the job, and a short description of what was done.

[Construction time sheet tracking](/blog/construction-time-sheet-tracking) and a [daily job report](/blog/daily-job-report-template) cover most of it. A [material log](/blog/material-log-job-costing) handles the rest. Attach a summary to each invoice, and questions about hours tend to disappear. In ContractorDocs, time sheets, material logs, expense logs and the invoice all sit on the same job, so the backup is already in one place ([see the document types](/features#documents)). Remodelers, who meet hidden conditions more than most trades, can see the full setup on the [page for remodelers](/for/remodelers).

These same records help on fixed price jobs too: comparing estimated against actual hours, as in [job costing: budget vs actual](/blog/job-costing-budget-vs-actual), is how your next fixed price gets more accurate.

## Checklist before you send the price

- [ ] Pricing method chosen on purpose, not out of habit
- [ ] Scope, inclusions and exclusions written down
- [ ] Hidden-conditions and change order rules stated
- [ ] For T&M: rates per role, material markup and invoicing frequency stated
- [ ] For a cap: amount and what happens near it stated
- [ ] Payment schedule included
- [ ] A way to track hours and materials on this job is set up before day one
- [ ] Contract wording checked against your state's rules for home improvement work

## What this comparison does not cover

Some states have specific rules for home improvement contracts, deposits and how prices must be stated, and public or commercial work often has its own contract forms. Cost-plus contracts with a fee, common on larger builds, are a related model not covered here. Check your local rules or ask a construction attorney before relying on a contract template.`,
  faq: [
    {
      q: 'Is time and materials or fixed price better for a contractor?',
      a: 'Neither is better in every case. Fixed price suits jobs with a clear scope that you have done before. Time and materials suits work with hidden conditions or a scope that is still changing. Many small contractors use both, depending on the job.',
    },
    {
      q: 'What is a not-to-exceed clause?',
      a: 'It is a cap on a time and materials contract. You bill actual hours and materials, but the total cannot pass the stated amount without a signed change. It gives the client a budget limit while you are still paid for real work up to that point.',
    },
    {
      q: 'How do I handle surprises on a fixed price job?',
      a: 'Write a hidden-conditions clause into the estimate and use a signed [change order](/blog/change-order-form-guide) before doing extra work. Without those, unexpected work usually comes out of your margin.',
    },
    {
      q: 'Do I mark up materials on a time and materials job?',
      a: 'Many contractors do, to cover buying, picking up and handling materials, but the markup has to be stated in the agreement. Some clients will ask for receipts, so keep them with the job.',
    },
    {
      q: 'Why do fixed price bids win more often?',
      a: 'Clients can budget around a known number, and comparing a total against an hourly rate feels easier. That is one reason to offer a fixed price when you can do so safely, or a capped T&M when you cannot.',
    },
  ],
  cta: {
    heading: 'Write the pricing method into a signed estimate',
    text: 'Build a fixed price or a rate-based estimate with your scope and exclusions, send it as a link and let the client approve it on their phone. You can start on the free plan.',
    href: '/estimate-generator',
    label: 'Open the estimate generator',
  },
};

export default post;
