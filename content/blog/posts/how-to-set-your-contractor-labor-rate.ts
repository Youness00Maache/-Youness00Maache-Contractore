import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-set-your-contractor-labor-rate',
  answer:
    'Set your labor rate by adding up what the business must earn in a year (wages, payroll costs, overhead and profit), then dividing by the hours you can realistically bill. Billable hours are far fewer than paid hours, so a rate based on wages alone will lose money.',
  takeaways: [
    'Your hourly rate must cover wages, payroll costs, overhead and profit, not just what you pay a worker.',
    'Divide yearly costs by billable hours, not by 2,080 paid hours. Driving, estimating and paperwork are not billable.',
    'Work out the rate for each role: owner, journeyman and helper are different numbers.',
    'Recheck the rate once or twice a year, and after every big cost change.',
  ],
  howTo: {
    name: 'How to set a contractor labor rate',
    totalTime: 'PT60M',
    steps: [
      { name: 'Decide the pay you want', text: 'Write the yearly wage for yourself and each worker, or the hourly wage times expected hours.' },
      { name: 'Add payroll costs', text: 'Add employer taxes, insurance, workers comp and benefits for each person.' },
      { name: 'Add yearly overhead', text: 'Total the costs that exist whether you work or not: vehicle, insurance, software, tools, phone and office.' },
      { name: 'Estimate billable hours', text: 'Subtract time off, driving, estimating and admin from the paid hours to get hours you can bill.' },
      { name: 'Divide and add profit', text: 'Divide total costs by billable hours, then add the profit margin you need.' },
    ],
  },
  body: `Most contractors start with a number they heard from another contractor, or the going rate in their area, and adjust it by feel. That can work for a while. It also explains why some busy shops struggle to pay themselves: the rate looked fine, but it never covered everything the business actually costs.

This guide builds your labor rate from your own numbers, with a worked example. All figures here are examples, not recommendations: plug in your own. If you already have a rate and want to know whether a job made money, pair this with [how to calculate job profit margin](/blog/how-to-calculate-job-profit-margin).

## Why wages are not a rate

If you pay a worker $30 an hour, charging $30 an hour loses money. On top of the wage you pay employer taxes, insurance and often benefits. Then the business has costs that exist even when the crew is idle. And the worker is not billable for every paid hour.

A labor rate has four parts:

| Part | What it covers |
| --- | --- |
| Wage | What the person is paid |
| Payroll costs | Employer taxes, workers compensation, other insurance, benefits |
| Overhead share | Truck, tools, software, phone, insurance, office, accounting |
| Profit | What the business keeps for risk, growth and a cushion |

Skip any one of them and you are paying for it out of your own pocket.

## Step 1: Start with the wage

Write down the yearly wage for each role you charge for. For yourself, decide what you would pay a stranger to do your field work, then separately decide what you need as an owner. Keep those apart: a business that only pays the owner a wage is not yet making profit.

Example: a journeyman at $30 an hour who is paid for 2,080 hours a year costs $62,400 in wages.

## Step 2: Add payroll costs

Employer-side costs differ by state and by trade, and workers compensation rates differ by trade classification. Do not guess: take the real figures from your payroll provider, insurance policy and accountant. A common way to express them is a percentage of wages.

Example: if payroll taxes, workers comp and benefits come to 25% of wages (an assumed figure for this example), the $62,400 becomes $78,000.

## Step 3: Add your overhead

Overhead is everything the business pays whether or not a job is running. List a full year:

- Vehicle payments, fuel, insurance and maintenance
- Tools and equipment replacement
- General liability and other insurance
- Phone, software and website
- Licenses and permits that are not job-specific
- Accounting, bookkeeping and legal
- Office or shop rent, and advertising

Example (assumed total): $36,000 a year. If you have three people in the field, split it across them, or across all billable hours (below).

## Step 4: Find your real billable hours

This is the step most people skip. A person paid for 2,080 hours does not bill 2,080 hours.

| Item | Hours a year (example) |
| --- | --- |
| Paid hours (40 x 52) | 2,080 |
| Holidays, vacation, sick time | about 160 |
| Driving between jobs and supply runs | about 250 |
| Estimating, admin, callbacks, idle gaps | about 250 |
| Billable hours | roughly 1,420 |

These are example figures. Track your own for a month and see. For an owner who also sells, estimates and does paperwork, the billable hours can be much lower than for a full-time field worker.

## Step 5: Do the division

Add the yearly costs and divide by billable hours.

Example for one journeyman: wages with payroll costs $78,000, plus an equal share of overhead (assume $12,000 for this person), makes $90,000. Divided by 1,420 billable hours, the break-even rate is about $63 an hour.

That is the rate at which the business neither makes nor loses money on this person. It is already far from the $30 wage.

## Step 6: Add profit

Now add the margin the business needs. If you want a 20% profit margin on revenue, divide the break-even rate by 0.80: 63 divided by 0.80 is about $79 an hour. A 20% markup on cost would give $75.60 instead, which is a different thing; see [how to calculate job profit margin](/blog/how-to-calculate-job-profit-margin) for margin versus markup.

So in this example, a $30 wage becomes a billed rate near $79 an hour. Your numbers will differ, sometimes a lot, but the shape is usually the same.

## Rate by role

Do the sum separately for each role: the owner, an experienced tradesperson, a helper or apprentice. The helper's rate is lower, but the overhead and billable-hours problem is the same. Many contractors keep two or three rates on their [price book](/features) so an estimate uses the right one automatically.

## Where the rate goes wrong most often

A few patterns show up again and again when a rate looks fine on paper but the bank account says otherwise:

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Busy all year, little left over | Billable hours set too high | Track a month of real billable time per person |
| Profit disappears on small jobs | Travel and setup not covered | Add a trip charge or a minimum job price |
| Owner works evenings for free | Estimating and admin hours not in overhead | Count your office hours and price them in |
| Rate fine, jobs still lose money | Estimates miss hours, not the rate | Compare estimated vs actual hours per job |
| Every new truck or policy hurts | Overhead list out of date | Rebuild the yearly overhead total |

Small jobs deserve a special word. A one-hour repair still needs a drive, a setup, a cleanup and an invoice. If you charge one hour at the rate, the job pays for maybe half of the time it really took. Many contractors set a minimum charge, or a trip fee plus the hourly rate, to cover that. Pick the approach that suits your market and write it on every estimate so it is never a surprise.

## Labor rate checklist

- [ ] Yearly wage written down for every role
- [ ] Payroll costs taken from real payroll, insurance and accountant numbers
- [ ] A full year of overhead totalled
- [ ] Billable hours estimated, not 2,080
- [ ] Break-even rate calculated per role
- [ ] Profit margin added by dividing, not by adding a percentage
- [ ] Rate compared with local market, and the gap understood
- [ ] A date set to review the rate again

## Checking your rate against the market

Once you know your number, compare it with what others charge nearby. If the market is lower, you do not simply accept a loss. You can improve billable hours (less driving, better scheduling), reduce overhead, charge a fixed price on jobs you do faster than average, or focus on work where clients value the result over the lowest quote.

If the market is higher, check you are not undercharging out of habit. Also remember that many jobs are priced as a total, not an hourly rate; see [good, better, best pricing](/blog/good-better-best-pricing-for-contractors) for a way to present options without arguing about hourly rates.

## Keep the rate honest with real data

A rate is a forecast. To test it, compare the hours you estimated with the hours you actually spent. Time sheets make that easy; see [construction time sheet tracking](/blog/construction-time-sheet-tracking) and [job costing: budget vs actual](/blog/job-costing-budget-vs-actual). When actual hours keep beating estimates, the rate is fine and the estimating is the problem. When you are fast but still not profitable, the rate is the problem. Once the rate is set, the free [estimate generator](/estimate-generator) is a quick way to see it on a real quote.

## What this guide does not cover

It does not tell you what your payroll taxes, insurance or benefits will cost, which depend on your state, trade and payroll setup. It is not tax or accounting advice: confirm the numbers with your accountant.`,
  faq: [
    {
      q: 'How do I calculate an hourly rate for my contracting business?',
      a: 'Add yearly wages, payroll costs and overhead, divide by the billable hours you can realistically sell, then add your profit margin. Billable hours are usually well below paid hours.',
    },
    {
      q: 'What are billable hours?',
      a: 'The hours you can actually charge a client for. Time spent driving, buying supplies, estimating, doing admin and waiting between jobs is paid but not billable.',
    },
    {
      q: 'Is overhead part of my labor rate?',
      a: 'Yes, in the hourly-rate method. Overhead can also be added as a percentage on top of direct cost, but it must be recovered somewhere or the business pays for it out of profit.',
    },
    {
      q: 'Should I charge hourly or a fixed price?',
      a: 'The rate is the building block either way. Use it to build the estimate, then present a fixed price when you know the job well. See [time and materials vs fixed price](/blog/time-and-materials-vs-fixed-price-contract) for when each fits.',
    },
    {
      q: 'How often should I update my labor rate?',
      a: 'At least once a year, and whenever wages, insurance, fuel or other big costs change. Compare estimated and actual hours on finished jobs to see whether the rate still holds.',
    },
  ],
  cta: {
    heading: 'Put your rate into every estimate',
    text: 'Save your labor rates and materials in your price book, build estimates in minutes and send them for approval from your phone. The free plan covers the basics.',
    href: '/auth/signup',
    label: 'Try ContractorDocs free',
  },
};

export default post;
