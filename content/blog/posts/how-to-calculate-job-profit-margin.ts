import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-calculate-job-profit-margin',
  answer:
    'Job profit margin is profit divided by the price the client pays; markup is profit divided by your cost. A 25% markup is only a 20% margin, so to hit a target margin divide your cost by (1 − margin) instead of multiplying it by (1 + markup), then track estimated vs. actual costs while the job is running.',
  takeaways: [
    'Markup is profit divided by cost; margin is profit divided by price. A 25% markup is only a 20% margin.',
    'To hit a target margin, divide cost by (1 − margin) instead of multiplying it by (1 + margin).',
    'Each job’s gross profit has to cover its share of overhead before any of it becomes net profit.',
    'Track estimated vs. actual costs by category while the job is running, not once a year at tax time.',
  ],
  body: `Ask a room of contractors what their profit margin is and you'll hear plenty of confident numbers. Ask how they calculated it and the answers split: some mean markup, some mean margin, some mean whatever was left in the bank account. Those are three different things, and mixing them up is one of the quietest ways to lose money on jobs that look fine on paper.

This guide gives you the formulas for markup and margin, a conversion table, how overhead changes the picture, and worked examples with round, hypothetical numbers. It finishes with a simple way to track estimated versus actual costs on every job, so you learn what a job earned while you can still do something about it.

## Markup vs. margin: the two formulas

Both numbers start from the same two inputs: what the job costs you and what you charge for it.

- **Markup** is profit as a percentage of cost: (Price − Cost) ÷ Cost
- **Margin** is profit as a percentage of price: (Price − Cost) ÷ Price

Take a job that costs $10,000 and sells for $12,500. The profit is $2,500.

- Markup = $2,500 ÷ $10,000 = 25%
- Margin = $2,500 ÷ $12,500 = 20%

Same job, same dollars, two different percentages. Neither is wrong; they answer different questions. Markup tells you how much to add to cost when you build a price. Margin tells you how much of every dollar you collect is profit, which is how your financial statements, your accountant and your lender look at the business.

### Setting a price from either one

- Price from markup: Cost × (1 + markup). Example: $10,000 × 1.25 = $12,500.
- Price from margin: Cost ÷ (1 − margin). Example: $10,000 ÷ 0.80 = $12,500.

The second formula is the one people get wrong. To earn a 20% margin you divide by 0.80; you don't multiply by 1.20. Multiplying $10,000 by 1.20 gives $12,000, which is a 20% markup and only a 16.7% margin.

## Markup to margin conversion table

Use this table when you know the margin you want and need the markup, or the multiplier, to apply to your costs.

| Margin you want | Markup to apply | Multiply cost by |
| --- | --- | --- |
| 10% | 11.1% | 1.111 |
| 15% | 17.6% | 1.176 |
| 20% | 25.0% | 1.250 |
| 25% | 33.3% | 1.333 |
| 30% | 42.9% | 1.429 |
| 35% | 53.8% | 1.538 |
| 40% | 66.7% | 1.667 |
| 50% | 100% | 2.000 |

If you need a number that isn't in the table, use the conversion formulas:

- Margin = Markup ÷ (1 + Markup)
- Markup = Margin ÷ (1 − Margin)

Notice how the gap widens as the numbers climb. At 10% the difference is small. At a 40% margin you need a 66.7% markup, and anyone who confuses the two is leaving real money behind.

## Gross profit, net profit and where overhead fits

The margin on a single job is usually a **gross** margin: price minus the direct costs of that job, meaning labor, materials, subcontractors, equipment and disposal. It's not what you keep.

**Net** profit is what's left after overhead, the costs of running the business that don't belong to any single job: truck payments, insurance, shop or office rent, phone, software, accounting, advertising, and the hours you spend estimating and managing instead of working on a job.

- Job gross profit = Price − Direct job costs
- Net profit = Gross profit − Share of overhead

Every job has to carry its share of overhead before it produces a dollar of real profit. That's why a job with a 15% gross margin can lose money if your overhead runs at 18% of revenue.

### Recovering overhead

There are a few common ways to spread overhead across jobs. Pick one and use it consistently.

1. **Percentage of revenue.** Divide annual overhead by annual revenue. It's simple and lines up with how margin is measured.
2. **Percentage of direct cost.** Divide annual overhead by annual direct costs and add that rate to each job's costs. Our [estimating guide](/blog/construction-estimate-template) uses this method.
3. **Per labor hour.** Divide annual overhead by field labor hours. This suits labor-heavy trades where material costs swing a lot from job to job.

Use real figures from last year's books, adjusted for changes you know are coming. If your books lump overhead and job costs together, your accountant can help you separate them.

## Worked example: working back from the profit you want

Here's a hypothetical small remodeling company. All numbers are round examples, not benchmarks.

- Revenue target for the year: $500,000
- Annual overhead: $75,000, which is 15% of revenue
- Net profit goal: 10% of revenue

To hit both, jobs need to average a **25% gross margin**: 15% to cover overhead plus 10% for profit. From the table, a 25% margin means a 33.3% markup, or multiplying direct costs by 1.333.

Now a single job with $15,000 of direct costs:

- Price: $15,000 ÷ 0.75 = $20,000
- Gross profit: $20,000 − $15,000 = $5,000, a 25% margin
- Overhead share: 15% × $20,000 = $3,000
- Net profit: $5,000 − $3,000 = $2,000, or 10%

### The same job priced with the wrong formula

Suppose the owner wants "25%" and multiplies costs by 1.25 instead:

- Price: $15,000 × 1.25 = $18,750
- Gross profit: $3,750, a 20% margin
- Overhead share: 15% × $18,750 = $2,812.50
- Net profit: $937.50, or 5%

Same crew, same work, same client. Confusing markup with margin cut the net profit by more than half and left $1,250 on the table on one mid-sized job.

### Different markups on labor and materials

Many contractors mark up labor, materials and subs at different rates. That's fine, as long as you check the blended result. Say the same $15,000 job is priced with 50% on labor, 20% on materials and equipment, and 15% on subs:

| Category | Cost | Markup | Price |
| --- | --- | --- | --- |
| Labor | $6,000 | 50% | $9,000 |
| Materials | $5,000 | 20% | $6,000 |
| Subcontractors | $3,000 | 15% | $3,450 |
| Equipment and other | $1,000 | 20% | $1,200 |
| **Total** | **$15,000** | 31% blended | **$19,650** |

The profit is $4,650, a margin of about 23.7%, which falls short of the 25% this company needs. The cost mix of each job decides the blended margin, so a material-heavy job priced this way earns a lower margin than a labor-heavy one. Check the total margin before you send any price.

## Tracking estimated vs. actual costs on every job

The margin on an estimate is a forecast. The real margin only exists after the work is done, and the only way to know it is to track actual costs against the estimate, in the same categories.

Using the $20,000 job above, here's what a post-job comparison might look like:

| Cost category | Estimated | Actual | Variance |
| --- | --- | --- | --- |
| Labor | $6,000 | $7,200 | +$1,200 |
| Materials | $5,000 | $5,400 | +$400 |
| Subcontractors | $3,000 | $3,000 | $0 |
| Equipment and other | $1,000 | $900 | −$100 |
| **Total direct cost** | **$15,000** | **$16,500** | **+$1,500** |

Costs ran 10% over the estimate. With the price unchanged at $20,000, gross profit fell to $3,500, a 17.5% margin. After the same $3,000 overhead share, net profit dropped from $2,000 to $500. A 10% cost overrun wiped out three-quarters of the profit.

### Find out why, not just how much

The variance column tells you where to look. Here, labor is the problem. Was it slow production, a new crew member, extra trips to the supplier, or work the client added that never made it onto a [change order](/blog/change-order-form-guide)? Each cause has a different fix: better hour estimates, better scheduling, or billing for the extra work.

To build this table, you need costs recorded by job as they happen:

- **Labor:** [time sheets by job](/blog/construction-time-sheet-tracking), multiplied by your burdened rate
- **Materials:** a [material log](/blog/material-log-job-costing) and supplier invoices tied to the job
- **Subs and equipment:** invoices filed under the job they belong to

### Check during the job, not just after

A closeout review teaches you something for next time. A weekly check can still save the current job. Compare costs to date with the share of work complete. If you've used half the labor budget and finished a third of the work, you know now, while you can still talk to the client about changes or rework the schedule.

## Common margin mistakes

- Using markup and margin interchangeably
- Calculating job profit without counting your own labor
- Forgetting overhead, so every job looks better than the business really is
- Giving a discount without checking the math: on a job with a 20% margin, a 10% discount cuts the profit in half
- Letting extra work slide instead of writing a change order
- Only looking at profit once a year, when the tax return is done

### Job profit review checklist

- [ ] Final price, direct costs and gross margin recorded for the job
- [ ] Labor hours entered from time sheets at the burdened rate
- [ ] Material receipts, returns and supplier invoices assigned to the job
- [ ] Sub and equipment invoices filed under the job
- [ ] Estimated vs. actual compared by category
- [ ] Biggest variance explained in one sentence
- [ ] Approved extra work invoiced, not forgotten
- [ ] Hour and price assumptions updated for the next estimate

## How ContractorDocs helps

ContractorDocs keeps the paperwork behind a margin calculation in one place, organized by job. Your estimates and invoices sit next to the time sheets, material logs, expense logs and receipts for the same job, and [job profit tracking](/features#profit-tracking) compares what you invoiced with the costs you recorded, so you can see each job's real result instead of guessing. There's also a built-in profit calculator for quick pricing math, and the [estimate generator](/estimate-generator) handles line items and tax. ContractorDocs isn't accounting software, so keep your books with your accountant, but it gives you the job-level numbers that many small contractors never get to see.`,
  faq: [
    {
      q: 'What is a good profit margin for a contractor?',
      a: 'It varies widely by trade, region, job size and business model, so there’s no universal number worth copying. A better approach is to work out the gross margin you need from your own books: your overhead as a percentage of revenue plus the net profit you want. If your market won’t support that margin, look hard at overhead and the kind of jobs you take.',
    },
    {
      q: 'Is a 20% markup the same as a 20% margin?',
      a: 'No. A 20% markup on cost produces a 16.7% margin. To earn a 20% margin you need a 25% markup, which is the same as dividing your cost by 0.80.',
    },
    {
      q: 'Should overhead be included in job costs?',
      a: 'Keep overhead separate from direct job costs in your records, but price every job so it carries a share of overhead. Mixing the two makes it impossible to see which jobs actually perform. Your accountant can help you decide which costs belong in each bucket.',
    },
    {
      q: 'How do I calculate margin on a job that had change orders?',
      a: 'Add the approved change order amounts to the job price and their costs to the job costs, then calculate margin the usual way. It also helps to look at each change order on its own, because underpriced extra work is a common reason a job’s final margin comes in low. See our [change order guide](/blog/change-order-form-guide) for pricing tips.',
    },
    {
      q: 'Do I need accounting software to track job profit?',
      a: 'Not for job-level tracking. A system that keeps estimates, invoices, time sheets and material costs together by job is enough to compare estimated and actual results. You still need proper books for taxes and financial statements, so work with an accountant or bookkeeper on that side.',
    },
  ],
  cta: {
    heading: 'See what every job really earned',
    text: 'Keep estimates, invoices, time sheets and material logs together by job, and compare what you invoiced with what you spent. The free plan covers all 12 document types.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
