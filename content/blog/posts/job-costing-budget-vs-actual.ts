import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'job-costing-budget-vs-actual',
  answer:
    'To track job costs, set a budget for each job by category (labor, materials, subcontractors and other), record actual costs against the same categories as they happen, and compare the share of the budget you have spent with how complete the job is. If you have used 60% of the budget on a job that is 45% done, you are over budget now, while there is still time to fix it.',
  takeaways: [
    'Budget vs actual only works if the budget and the costs use the same few categories.',
    'Spent money alone tells you little. Compare the percent of budget used with the percent of the job complete.',
    'Labor is the cost that drifts most, so log hours per job every day, not at the end of the week.',
    'Unbilled time and materials are lost profit on T&M work. Bill them on a schedule, not from memory.',
  ],
  body: `Tracking job costs means comparing what you planned to spend on a job with what you have actually spent, category by category, while the job is still running. Set the budget from your estimate, log every cost against the same categories, and check one number each week: are costs ahead of the work, or behind it?

Most small contractors find out whether a job made money weeks after it's finished, when the bank balance is lower than expected. Budget vs actual moves that answer forward to the middle of the job, when you can still change something: renegotiate a change order, move a crew, or stop a material leak.

## The four numbers you need

You don't need accounting software to job-cost. You need four numbers for each job:

1. **Budget:** what you planned to spend, split by category
2. **Actual:** what you've spent so far, in the same categories
3. **Percent complete:** how much of the work is done
4. **Contract value:** what the client is paying, including approved change orders

Keep the categories few and simple. Four is enough for most small contractors: labor, materials, subcontractors and other (equipment rental, permits, dumpsters). If your estimate, purchase orders, material logs and time sheets all use the same four, the comparison takes minutes instead of an evening.

## The formulas

| Measure | Formula | What it tells you |
| --- | --- | --- |
| Variance | Budget − Actual | Money left in a category (negative means over) |
| Percent of budget used | Actual ÷ Budget | How much of the plan you've spent |
| Cost vs progress | Percent of budget used − Percent complete | Positive means costs are running ahead of the work |
| Projected final cost | Actual ÷ Percent complete | Where costs end up if the job keeps this pace |
| Projected profit | Contract value − Projected final cost | What you'll actually make |

The projected final cost formula is a simple straight-line estimate. It assumes the rest of the job costs what the first part did, which is rough but good enough to raise a flag early.

## A worked example

Here's a hypothetical kitchen remodel with round numbers. The contract value, including one approved change order, is $40,000. The estimated cost is $30,000, for a planned profit of $10,000.

Halfway through, the job is 50% complete:

| Category | Budget | Actual so far | Percent used |
| --- | --- | --- | --- |
| Labor | $12,000 | $7,500 | 63% |
| Materials | $14,000 | $8,000 | 57% |
| Subcontractors | $3,000 | $1,500 | 50% |
| Other | $1,000 | $500 | 50% |
| **Total** | **$30,000** | **$17,500** | **58%** |

The job has used 58% of its budget but is only 50% done. Projected final cost is $17,500 ÷ 0.50 = $35,000, so projected profit drops from $10,000 to $5,000. The table also shows where: labor is running furthest ahead, followed by materials.

That's the whole point of tracking mid-job. With half the job left, the contractor can find out why labor is over (a slow sub, rework, a scope creep nobody wrote down) and act on it. A change order for the extra scope, priced the way our [change order guide](/blog/change-order-form-guide) describes, might recover most of the gap.

## Where the actual costs come from

Actual costs are only as good as the records behind them. Each category has its own source:

- **Labor:** time sheets, with hours per worker per job, multiplied by a labor cost rate that includes payroll taxes and insurance. Our [time sheet guide](/blog/construction-time-sheet-tracking) covers how to track hours by job and task.
- **Materials:** purchase orders for what you ordered, and material logs for what was delivered, used and returned. See [material logs and job costing](/blog/material-log-job-costing).
- **Subcontractors:** their invoices, or the purchase orders you issued them.
- **Other:** expense logs and receipts for rentals, permits, disposal and fuel.

Two rules prevent most errors. First, log costs to a job the day they happen; a receipt in the truck for two weeks is a cost that never gets counted. Second, count each cost once: a material that appears on both a purchase order and a material log shouldn't be counted twice.

## Setting up job costing: a checklist

- [ ] Pick four cost categories and use them everywhere
- [ ] Build each estimate with lines you can put into those categories
- [ ] Set a labor cost rate per worker that includes burden, not just the wage
- [ ] Log hours per job every day
- [ ] Log materials at delivery, including returns and leftovers
- [ ] Update percent complete weekly
- [ ] Compare percent of budget used with percent complete every week

## How it works in ContractorDocs

In ContractorDocs, open a job and click **Financials**. The job's profit is at the top, and **Budget vs actual** is underneath.

**The budget** is the accepted estimate plus approved change orders, split into Labor, Materials, Expenses and Subs & other by the kind of each line: its price book type, an inventory item, or words such as labor, install or permit. A line that mixes labor and material stays Not split, so you can see what wasn't categorized.

**The actual costs** are time sheets multiplied by your labor rate (with overtime at 1.5x), material logs and expense logs, plus purchase orders you've sent. A purchase order line that also appears on a material log counts once.

**Percent complete** comes from the lines of a progress-billing invoice if you use one; otherwise you type it in **Job complete**. When more of the budget is used than the job is complete, ContractorDocs shows "Costs are ahead of the work" in red, along with the profit you'd end with at the current pace.

The same Financials view shows the job's overall profit: income from invoices minus materials, expenses and labor. Read more about [profit tracking](/features#profit-tracking), or see how remodelers use it on our [page for remodelers](/templates).

## Billing time and materials without losing hours

On time-and-materials work, every unbilled hour is lost profit. In ContractorDocs, click **Bill time & materials** on the job page (**Bill T&M** on a phone). Unbilled time sheets and material log lines are listed and ticked, and you can tick expense logs too. Set the labor rate per hour, the materials markup (items in your price book keep their price) and the bill-through date, choose per worker or per day, check the invoice preview, and click **Create draft invoice**.

The time sheets and material lines on that invoice are marked billed, so they aren't offered again. If you cancel or delete the invoice, they can be billed again. For pricing your markup correctly, see our guide to [markup vs. margin](/blog/how-to-calculate-job-profit-margin).

## Common job costing mistakes

- **Budgeting with the selling price instead of cost.** Compare costs to costs, or keep the contract value separate.
- **Forgetting change orders.** Approved changes raise both the budget and the contract value.
- **Using the wage as the labor cost.** Payroll taxes, insurance and non-billable time make the real rate higher.
- **Checking once, at the end.** The value of budget vs actual is the early warning. Look weekly.

## Fixed-price jobs vs time-and-materials jobs

Job costing matters on both kinds of work, but for different reasons. On a fixed-price job, every dollar over budget comes straight out of your profit, so the early warning is the whole value: you need to know by the halfway point, not at closeout. On a time-and-materials job, overruns are billable, so the risk is different. Hours and materials that never make it onto an invoice are the leak. Track both kinds the same way, but on T&M work, bill on a fixed schedule, weekly or at each milestone, so nothing waits long enough to be forgotten. See the [pricing page](/pricing) for what each ContractorDocs plan includes.`,
  faq: [
    {
      q: 'What is budget vs actual in construction?',
      a: 'It’s a comparison of what you planned to spend on a job with what you’ve actually spent, by category such as labor, materials and subcontractors. Checked during the job, it shows which costs are running over while you can still act.',
    },
    {
      q: 'How do you calculate if a job is over budget?',
      a: 'Divide actual costs by the budget to get the percent of budget used, then compare it with the percent of the job that’s complete. If you’ve used 60% of the budget on a job that’s 45% done, costs are ahead of the work.',
    },
    {
      q: 'How often should a small contractor review job costs?',
      a: 'Weekly for active jobs is a good rhythm. Log costs daily so the weekly review is quick, and check right after any change order or major delivery.',
    },
    {
      q: 'What cost categories should a small contractor use?',
      a: 'Four is enough for most: labor, materials, subcontractors and other. Use the same categories on your estimates, purchase orders, material logs and time sheets. Our [estimate template guide](/blog/construction-estimate-template) shows how to price each one.',
    },
    {
      q: 'Can ContractorDocs turn time sheets into an invoice?',
      a: 'Yes. Bill time & materials gathers unbilled time sheets and material log lines for a job, applies your labor rate and materials markup, and creates a draft invoice you check before sending. Billed entries are marked so they aren’t billed twice. See [features](/features#profit-tracking).',
    },
  ],
  cta: {
    heading: 'See every job’s budget vs actual',
    text: 'Estimates, change orders, time sheets, material logs and expenses in one place, with job profit and costs-ahead warnings. Free to start.',
    href: '/features',
    label: 'See the features',
  },
};

export default post;
